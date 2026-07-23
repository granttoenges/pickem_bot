FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY draftkings_scraper.py ${LAMBDA_TASK_ROOT}/draftkings_scraper.py

CMD ["draftkings_scraper.handler"]
