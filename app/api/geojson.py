from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import exceptions, status
from django.core.exceptions import ObjectDoesNotExist
import json
import os

from app import models
from webodm.settings import DISABLE_PERMISSIONS, MEDIA_ROOT

def crash_with_style(message: str, status):
    return Response({
        'detail': message
    }, status=status)

def save_geojson(project_pk, pk, payload):
    try:
        task_path = os.path.join(MEDIA_ROOT, "project", str(project_pk), "task", str(pk))
        if not os.path.exists(task_path):
            return crash_with_style(f"Task path does not exist: {task_path}", status.HTTP_500_INTERNAL_SERVER_ERROR)

        geojson_string = json.dumps(payload)
        file_path = os.path.join(task_path, 'assets', 'ai_detections', 'fields', 'field_detection.geojson')
        directory_path = os.path.dirname(file_path)
        
        os.makedirs(directory_path, exist_ok=True)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(geojson_string)

        return Response("JSON saved successfully", status=status.HTTP_200_OK)
    except Exception as error:
        return crash_with_style(f"Error in save_geojson: {error}", status.HTTP_500_INTERNAL_SERVER_ERROR)

class SaveGeoJson(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, project_pk, pk):

        project = None
        if not DISABLE_PERMISSIONS:
            try:
                project = models.Project.objects.get(pk=project_pk, deleting=False)
                if not request.user.has_perm('view_project', project): raise ObjectDoesNotExist()
            except ObjectDoesNotExist:
                raise exceptions.NotFound()
                
        if request.user.is_staff or request.user.has_perm('change_project', project) or DISABLE_PERMISSIONS:
            payload = request.data.get('payload', "")
            return save_geojson(project_pk, pk, payload)
        else:
            return crash_with_style(f"You don't have permission to access project: {project_pk}", status.HTTP_401_UNAUTHORIZED)