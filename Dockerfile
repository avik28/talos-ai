FROM python:3.11
WORKDIR /code
COPY ./backend/requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir -r /code/requirements.txt
COPY ./backend /code/backend
COPY ./datasets /code/datasets
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
