import os
import sqlite3
import json
import uuid
from typing import List, Dict, Any, Optional

class Database:
    def __init__(self, db_path: str = "nexus.db"):
        self.db_path = db_path
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Conversations
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')
            
            # Messages
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                agent_logs TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
            )
            ''')

            # Document Chunks
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                doc_name TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                embedding TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')

            # Profile Memories
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS profile_memories (
                id TEXT PRIMARY KEY,
                fact_type TEXT NOT NULL,
                memory_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')

            # Custom Skills
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS custom_skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL,
                code_snippet TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')

            # Semantic Cache
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS semantic_cache (
                id TEXT PRIMARY KEY,
                query_text TEXT NOT NULL,
                embedding TEXT NOT NULL,
                response_text TEXT NOT NULL,
                chat_model TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            ''')

            conn.commit()

    # Conversations Management
    def create_conversation(self, title: str = "New Session") -> str:
        conv_id = str(uuid.uuid4())
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO conversations (id, title) VALUES (?, ?)",
                (conv_id, title)
            )
            conn.commit()
        return conv_id

    def list_conversations(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM conversations ORDER BY updated_at DESC")
            return [dict(row) for row in cursor.fetchall()]

    def delete_conversation(self, conv_id: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
            cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            conn.commit()

    # Messages Management
    def add_message(self, conversation_id: str, role: str, content: str, sources: Optional[List[Dict]] = None, agent_logs: Optional[List[Dict]] = None) -> str:
        msg_id = str(uuid.uuid4())
        sources_json = json.dumps(sources) if sources else None
        logs_json = json.dumps(agent_logs) if agent_logs else None
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO messages (id, conversation_id, role, content, sources, agent_logs) VALUES (?, ?, ?, ?, ?, ?)",
                (msg_id, conversation_id, role, content, sources_json, logs_json)
            )
            cursor.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conversation_id,))
            conn.commit()
        return msg_id

    def get_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", (conversation_id,))
            rows = cursor.fetchall()
            result = []
            for row in rows:
                item = dict(row)
                if item.get("sources"):
                    item["sources"] = json.loads(item["sources"])
                if item.get("agent_logs"):
                    item["agent_logs"] = json.loads(item["agent_logs"])
                result.append(item)
            return result

    # Document Chunks
    def add_document_chunk(self, doc_name: str, chunk_index: int, content: str, embedding: List[float]) -> str:
        chunk_id = str(uuid.uuid4())
        embedding_json = json.dumps(embedding)
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO document_chunks (id, doc_name, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)",
                (chunk_id, doc_name, chunk_index, content, embedding_json)
            )
            conn.commit()
        return chunk_id

    def get_all_chunks(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM document_chunks")
            rows = cursor.fetchall()
            res = []
            for row in rows:
                item = dict(row)
                item["embedding"] = json.loads(item["embedding"])
                res.append(item)
            return res

    def delete_document(self, doc_name: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM document_chunks WHERE doc_name = ?", (doc_name,))
            conn.commit()

    def list_documents(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT doc_name, COUNT(*) as chunk_count FROM document_chunks GROUP BY doc_name")
            return [dict(row) for row in cursor.fetchall()]

    # Profile Memories
    def add_profile_memory(self, fact_type: str, memory_text: str) -> str:
        mem_id = str(uuid.uuid4())
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO profile_memories (id, fact_type, memory_text) VALUES (?, ?, ?)",
                (mem_id, fact_type, memory_text)
            )
            conn.commit()
        return mem_id

    def list_profile_memories(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM profile_memories ORDER BY created_at DESC")
            return [dict(row) for row in cursor.fetchall()]

    def delete_profile_memory(self, mem_id: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM profile_memories WHERE id = ?", (mem_id,))
            conn.commit()

    # Custom Skills
    def add_custom_skill(self, name: str, description: str, code_snippet: str) -> str:
        skill_id = str(uuid.uuid4())
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO custom_skills (id, name, description, code_snippet) VALUES (?, ?, ?, ?)",
                (skill_id, name, description, code_snippet)
            )
            conn.commit()
        return skill_id

    def list_custom_skills(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM custom_skills ORDER BY created_at DESC")
            return [dict(row) for row in cursor.fetchall()]

    def delete_custom_skill(self, skill_id: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM custom_skills WHERE id = ?", (skill_id,))
            conn.commit()

    # Semantic Cache
    def add_to_cache(self, query_text: str, embedding: List[float], response_text: str, chat_model: str = ""):
        cache_id = str(uuid.uuid4())
        emb_json = json.dumps(embedding)
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO semantic_cache (id, query_text, embedding, response_text, chat_model) VALUES (?, ?, ?, ?, ?)",
                (cache_id, query_text, emb_json, response_text, chat_model)
            )
            conn.commit()

    def search_cache(self, query_embedding: List[float], threshold: float = 0.94) -> Optional[str]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM semantic_cache")
            rows = cursor.fetchall()
            
            import math
            def cosine_similarity(v1, v2):
                dot = sum(a * b for a, b in zip(v1, v2))
                mag1 = math.sqrt(sum(a * a for a in v1))
                mag2 = math.sqrt(sum(b * b for b in v2))
                if mag1 == 0 or mag2 == 0:
                    return 0.0
                return dot / (mag1 * mag2)

            best_match = None
            highest_score = 0.0

            for row in rows:
                emb = json.loads(row["embedding"])
                score = cosine_similarity(query_embedding, emb)
                if score > highest_score:
                    highest_score = score
                    best_match = row["response_text"]

            if highest_score >= threshold:
                return best_match
            return None
