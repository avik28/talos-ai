FROM python:3.10-slim
WORKDIR /app

COPY ml/requirements.txt ./ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt

COPY datasets/ ./datasets/
COPY ml/ ./ml/

CMD ["python", "ml/pipelines/training_pipeline.py"]
