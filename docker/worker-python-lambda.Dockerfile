FROM public.ecr.aws/lambda/python:3.13

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock ./
COPY backend/ backend/
COPY workflows/python/ workflows/python/

RUN uv export --quiet --frozen --no-dev --package banking-demo-workflows --format requirements-txt --no-emit-project --no-emit-workspace --output-file requirements.txt \
    && uv pip install --system --no-cache -r requirements.txt \
    && uv pip install --system --no-cache --no-deps ./backend ./workflows/python \
    && rm requirements.txt

CMD ["banking_workflows.lambda_worker.lambda_handler"]
