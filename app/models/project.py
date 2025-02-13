import logging

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models import signals
from django.dispatch import receiver
from django.utils import timezone
from guardian.models import GroupObjectPermissionBase
from guardian.models import UserObjectPermissionBase
from guardian.shortcuts import get_perms_for_model, assign_perm
from django.utils.translation import gettext_lazy as _, gettext
from django.db import transaction

from app import pending_actions

from nodeodm import status_codes

logger = logging.getLogger('app.logger')


class Project(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, help_text=_("A pessoa que criou o projeto"), verbose_name=_("Owner"))
    name = models.CharField(max_length=255, help_text=_("Um rótulo usado para descrever o projeto"), verbose_name=_("Name"))
    description = models.TextField(default="", blank=True, help_text=_("Descrição mais detalhada do projeto"), verbose_name=_("Description"))
    created_at = models.DateTimeField(default=timezone.now, help_text=_("Data de criação"), verbose_name=_("Created at"))
    deleting = models.BooleanField(db_index=True, default=False, help_text=_("Se este projeto foi marcado para exclusão. Os projetos que possuem tarefas em execução precisam aguardar que as tarefas sejam devidamente limpas antes de serem excluídas."), verbose_name=_("Deleting"))
    tags = models.TextField(db_index=True, default="", blank=True, help_text=_("Tags do projeto"), verbose_name=_("Tags"))
    
    def delete(self, *args):
        # No tasks?
        if self.task_set.count() == 0:
            # Just delete normally
            logger.info("Deleted project {}".format(self.id))
            super().delete(*args)
        else:
            # Need to remove all tasks before we can remove this project
            # which will be deleted by workers after pending actions
            # have been completed
            self.task_set.update(pending_action=pending_actions.REMOVE)
            self.deleting = True
            self.save()
            logger.info("Tasks pending, set project {} deleting flag".format(self.id))

    def __str__(self):
        return self.name

    def tasks(self):
        return self.task_set.only('id')

    def tasks_count(self):
        return self.task_set.count()

    def get_map_items(self):
        return [task.get_map_items() for task in self.task_set.filter(
                    status=status_codes.COMPLETED
                ).filter(Q(orthophoto_extent__isnull=False) | Q(dsm_extent__isnull=False) | Q(dtm_extent__isnull=False))
                .only('id', 'project_id')]
    
    def duplicate(self, new_owner=None):
        try:
            with transaction.atomic():
                project = Project.objects.get(pk=self.pk)
                project.pk = None
                project.name = gettext('Copy of %(task)s') % {'task': self.name}
                project.created_at = timezone.now()
                if new_owner is not None:
                    project.owner = new_owner
                project.save()
                project.refresh_from_db()

                for task in self.task_set.all():
                    new_task = task.duplicate(set_new_name=False)
                    if not new_task:
                        raise Exception("Failed to duplicate {}".format(new_task))
                    
                    # Move/Assign to new duplicate
                    new_task.project = project
                    new_task.save()
                    
            return project
        except Exception as e:
            logger.warning("Cannot duplicate project: {}".format(str(e)))
        
        return False



    class Meta:
        verbose_name = _("Project")
        verbose_name_plural = _("Projects")

@receiver(signals.post_save, sender=Project, dispatch_uid="project_post_save")
def project_post_save(sender, instance, created, **kwargs):
    """
    Automatically assigns all permissions to the owner. If the owner changes
    it's up to the user/developer to remove the previous owner's permissions.
    """
    for perm in get_perms_for_model(sender).all():
        assign_perm(perm.codename, instance.owner, instance)


class ProjectUserObjectPermission(UserObjectPermissionBase):
    content_object = models.ForeignKey(Project, on_delete=models.CASCADE)


class ProjectGroupObjectPermission(GroupObjectPermissionBase):
    content_object = models.ForeignKey(Project, on_delete=models.CASCADE)
