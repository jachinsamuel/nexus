import os
from typing import List, Dict, Any

class WorkspaceManager:
    def __init__(self, root_dir: str = "."):
        self.root_dir = os.path.abspath(root_dir)

    def set_root_dir(self, path: str):
        if os.path.exists(path) and os.path.isdir(path):
            self.root_dir = os.path.abspath(path)
            return True
        return False

    def list_files(self) -> List[Dict[str, Any]]:
        result = []
        for root, dirs, files in os.walk(self.root_dir):
            if '.git' in root or '__pycache__' in root or 'node_modules' in root or '.venv' in root:
                continue
            for file in files:
                rel_path = os.path.relpath(os.path.join(root, file), self.root_dir)
                result.append({"name": file, "path": rel_path})
        return result

    def read_file(self, rel_path: str) -> str:
        full_path = os.path.join(self.root_dir, rel_path)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        return ""

    def write_file(self, rel_path: str, content: str) -> bool:
        full_path = os.path.join(self.root_dir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True

workspace_manager = WorkspaceManager()
