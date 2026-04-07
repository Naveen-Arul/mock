from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


os.environ.setdefault("SECRET_KEY", "requirements-check-secret")
os.environ.setdefault("AUTO_CREATE_DB", "false")
os.environ.setdefault("OWNER_SEED_ON_STARTUP", "false")


MODULES = [
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "pydantic",
    "dotenv",
    "jose",
    "passlib.context",
    "groq",
    "openai",
    "aiofiles",
    "httpx",
    "typing_extensions",
    "langgraph.graph",
    "langgraph.graph.message",
    "langchain_groq",
    "langchain_core.messages",
    "langchain_core.tools",
    "cv2",
    "numpy",
    "pypdf",
    "docx",
    "bcrypt",
    "cryptography",
    "app.database",
    "app.models",
    "app.utils.auth",
    "app.utils.deps",
    "app.utils.ai_services",
    "app.utils.tts",
    "app.api.auth",
    "app.api.students",
    "app.api.admin",
    "app.api.super_admin",
    "app.api.owner",
    "app.api.interviews",
    "app.api.tts",
    "app.main",
]


def main() -> int:
    missing: list[tuple[str, str]] = []

    for module_name in MODULES:
        try:
            importlib.import_module(module_name)
            print(f"OK   {module_name}")
        except Exception as exc:
            missing.append((module_name, f"{type(exc).__name__}: {exc}"))
            print(f"FAIL {module_name} -> {type(exc).__name__}: {exc}")

    if missing:
        print("\nMissing or failing imports:")
        for module_name, reason in missing:
            print(f"- {module_name}: {reason}")
        return 1

    print("\nAll backend imports resolved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())