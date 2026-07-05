from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import platform
import sqlite3
import sys
import time


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DB_PATH = BASE_DIR / "nutritionists.sqlite"
STARTED_AT = time.time()


SEED_ADMINS = [
    {
        "name": "Administrador Master",
        "access_key": "ADMIN MASTER",
        "password": "master123",
        "role": "master",
    },
    {
        "name": "Administrador",
        "access_key": "ADMIN",
        "password": "admin123",
        "role": "admin",
    },
    {
        "name": "Equipe de Suporte",
        "access_key": "SUPORTE",
        "password": "suporte123",
        "role": "support",
    },
]


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def add_column_if_missing(connection, table, column, definition):
    columns = connection.execute(f"PRAGMA table_info({table})").fetchall()
    existing_columns = {column_info["name"] for column_info in columns}

    if column not in existing_columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate_admin_role_constraint(connection):
    schema = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'admins'"
    ).fetchone()

    if not schema or "'support'" in schema["sql"]:
        return

    connection.execute("ALTER TABLE admins RENAME TO admins_old")
    connection.execute(
        """
        CREATE TABLE admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            access_key TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('master', 'admin', 'support')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        INSERT INTO admins (id, name, access_key, password_hash, role, active, created_at)
        SELECT id, name, access_key, password_hash, role, active, created_at
        FROM admins_old
        """
    )
    connection.execute("DROP TABLE admins_old")


def setup_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS nutritionists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                cpf TEXT NOT NULL,
                birth_date TEXT NOT NULL,
                crn TEXT NOT NULL UNIQUE,
                crn_region TEXT NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                rejection_reason TEXT,
                support_note TEXT,
                contacted_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )
            """
        )
        add_column_if_missing(connection, "nutritionists", "rejection_reason", "TEXT")
        add_column_if_missing(connection, "nutritionists", "support_note", "TEXT")
        add_column_if_missing(connection, "nutritionists", "contacted_at", "TEXT")
        add_column_if_missing(connection, "nutritionists", "updated_at", "TEXT")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                access_key TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('master', 'admin', 'support')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        migrate_admin_role_constraint(connection)

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS support_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                assigned_admin_id INTEGER,
                status TEXT NOT NULL DEFAULT 'open',
                response TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT,
                FOREIGN KEY (assigned_admin_id) REFERENCES admins(id)
            )
            """
        )

        for admin in SEED_ADMINS:
            connection.execute(
                """
                INSERT OR IGNORE INTO admins (name, access_key, password_hash, role)
                VALUES (?, ?, ?, ?)
                """,
                (
                    admin["name"],
                    admin["access_key"],
                    hash_password(admin["password"]),
                    admin["role"],
                ),
            )

        connection.commit()


def row_to_public_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "cpf": row["cpf"],
        "birthDate": row["birth_date"],
        "crn": row["crn"],
        "crnRegion": row["crn_region"],
        "email": row["email"],
        "status": row["status"],
        "rejectionReason": row["rejection_reason"],
        "supportNote": row["support_note"],
        "contactedAt": row["contacted_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def admin_to_public_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "accessKey": row["access_key"],
        "role": row["role"],
        "active": bool(row["active"]),
        "createdAt": row["created_at"],
    }


def support_message_to_public_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "subject": row["subject"],
        "message": row["message"],
        "assignedAdminId": row["assigned_admin_id"],
        "assignedAdminName": row["assigned_admin_name"] if "assigned_admin_name" in row.keys() else None,
        "status": row["status"],
        "response": row["response"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def get_admin_from_headers(headers):
    access_key = headers.get("X-Admin-Key", "").strip()

    if not access_key:
        return None

    with get_connection() as connection:
        return connection.execute(
            "SELECT * FROM admins WHERE access_key = ? AND active = 1",
            (access_key,),
        ).fetchone()


def format_uptime(seconds):
    minutes, _ = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    days, hours = divmod(hours, 24)

    if days:
        return f"{days}d {hours}h {minutes}min"

    if hours:
        return f"{hours}h {minutes}min"

    return f"{minutes}min"


class NutriHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length).decode("utf-8")
        return json.loads(body or "{}")

    def require_admin(self, roles=None):
        """Valida a sessão do admin pelo header X-Admin-Key.

        `roles` pode ser None (qualquer admin logado), uma string
        (um único cargo permitido) ou uma lista de cargos permitidos.
        Isso é o que garante que a hierarquia ADMIN MASTER > ADMIN > SUPORTE
        seja respeitada em cada rota, e não só sugerida na interface.
        """
        admin = get_admin_from_headers(self.headers)

        if not admin:
            self.send_json(401, {"message": "Faça login como administrador."})
            return None

        if roles:
            allowed_roles = [roles] if isinstance(roles, str) else roles

            if admin["role"] not in allowed_roles:
                self.send_json(403, {"message": "Seu cargo não tem permissão para esta ação."})
                return None

        return admin

    def do_GET(self):
        if self.path == "/api/admin/overview":
            self.handle_admin_overview()
            return

        if self.path == "/api/nutritionists":
            admin = self.require_admin()
            if not admin:
                return

            with get_connection() as connection:
                rows = connection.execute(
                    "SELECT * FROM nutritionists ORDER BY created_at DESC"
                ).fetchall()
            self.send_json(200, {"nutritionists": [row_to_public_dict(row) for row in rows]})
            return

        if self.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        if self.path == "/api/register":
            self.handle_register()
            return

        if self.path == "/api/support/request":
            self.handle_support_request()
            return

        if self.path == "/api/login":
            self.handle_login()
            return

        if self.path == "/api/admin/login":
            self.handle_admin_login()
            return

        if self.path.startswith("/api/nutritionists/") and self.path.endswith("/approve"):
            self.handle_change_nutritionist_status("approved")
            return

        if self.path.startswith("/api/nutritionists/") and self.path.endswith("/reject"):
            self.handle_change_nutritionist_status("rejected")
            return

        if self.path.startswith("/api/nutritionists/") and self.path.endswith("/contact"):
            self.handle_contact_nutritionist()
            return

        if self.path.startswith("/api/admins/") and self.path.endswith("/role"):
            self.handle_change_admin_role()
            return

        if self.path.startswith("/api/support/messages/") and self.path.endswith("/reply"):
            self.handle_support_reply()
            return

        self.send_json(404, {"message": "Rota não encontrada."})

    def handle_register(self):
        try:
            data = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Dados inválidos."})
            return

        required_fields = ["name", "cpf", "birthDate", "crn", "crnRegion", "email", "password"]
        missing_fields = [field for field in required_fields if not str(data.get(field, "")).strip()]

        if missing_fields:
            self.send_json(400, {"message": "Preencha todos os campos obrigatórios."})
            return

        try:
            with get_connection() as connection:
                connection.execute(
                    """
                    INSERT INTO nutritionists
                    (name, cpf, birth_date, crn, crn_region, email, password_hash, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                    """,
                    (
                        data["name"].strip(),
                        data["cpf"].strip(),
                        data["birthDate"].strip(),
                        data["crn"].strip(),
                        data["crnRegion"].strip(),
                        data["email"].strip(),
                        hash_password(data["password"]),
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError:
            self.send_json(409, {"message": "Já existe um cadastro com este CRN."})
            return

        self.send_json(201, {"message": "Cadastro enviado! Aguarde aprovação do administrador."})

    def handle_support_request(self):
        try:
            data = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Dados inválidos."})
            return

        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip()
        subject = str(data.get("subject", "Dúvida de acesso")).strip()
        message = str(data.get("message", "")).strip()

        if not name or not email or not message:
            self.send_json(400, {"message": "Preencha nome, e-mail e mensagem."})
            return

        with get_connection() as connection:
            support = connection.execute(
                """
                SELECT admins.id, COUNT(support_messages.id) AS open_count
                FROM admins
                LEFT JOIN support_messages
                    ON support_messages.assigned_admin_id = admins.id
                    AND support_messages.status IN ('open', 'in_progress')
                WHERE admins.role = 'support' AND admins.active = 1
                GROUP BY admins.id
                ORDER BY open_count ASC, admins.id ASC
                LIMIT 1
                """
            ).fetchone()
            assigned_admin_id = support["id"] if support else None
            connection.execute(
                """
                INSERT INTO support_messages
                (name, email, subject, message, assigned_admin_id, status)
                VALUES (?, ?, ?, ?, ?, 'open')
                """,
                (name, email, subject, message, assigned_admin_id),
            )
            connection.commit()

        self.send_json(201, {"message": "Mensagem enviada ao suporte. Em breve entraremos em contato."})

    def handle_login(self):
        try:
            data = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Dados inválidos."})
            return

        crn = str(data.get("crn", "")).strip()
        password = str(data.get("password", ""))

        if not crn or not password:
            self.send_json(400, {"message": "Preencha CRN e senha."})
            return

        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM nutritionists WHERE crn = ? AND password_hash = ?",
                (crn, hash_password(password)),
            ).fetchone()

        if not row:
            self.send_json(401, {"message": "CRN ou senha inválidos."})
            return

        if row["status"] == "pending":
            self.send_json(403, {"message": "Seu cadastro ainda está aguardando aprovação."})
            return

        if row["status"] == "rejected":
            self.send_json(403, {"message": "Seu cadastro foi desaprovado. Entre em contato com o suporte."})
            return

        self.send_json(200, {"message": "Login realizado com sucesso.", "nutritionist": row_to_public_dict(row)})

    def handle_admin_login(self):
        try:
            data = self.read_json_body()
        except json.JSONDecodeError:
            self.send_json(400, {"message": "Dados inválidos."})
            return

        access_key = str(data.get("accessKey", "")).strip()
        password = str(data.get("password", ""))

        if not access_key or not password:
            self.send_json(400, {"message": "Preencha chave de acesso e senha."})
            return

        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT * FROM admins
                WHERE access_key = ? AND password_hash = ? AND active = 1
                """,
                (access_key, hash_password(password)),
            ).fetchone()

        if not row:
            self.send_json(401, {"message": "Chave ou senha de administrador inválida."})
            return

        self.send_json(200, {"message": "Login admin realizado.", "admin": admin_to_public_dict(row)})

    def handle_admin_overview(self):
        admin = self.require_admin()
        if not admin:
            return

        with get_connection() as connection:
            stats = {
                "totalNutritionists": connection.execute("SELECT COUNT(*) AS count FROM nutritionists").fetchone()["count"],
                "pendingNutritionists": connection.execute("SELECT COUNT(*) AS count FROM nutritionists WHERE status = 'pending'").fetchone()["count"],
                "approvedNutritionists": connection.execute("SELECT COUNT(*) AS count FROM nutritionists WHERE status = 'approved'").fetchone()["count"],
                "rejectedNutritionists": connection.execute("SELECT COUNT(*) AS count FROM nutritionists WHERE status = 'rejected'").fetchone()["count"],
                "contactedNutritionists": connection.execute("SELECT COUNT(*) AS count FROM nutritionists WHERE contacted_at IS NOT NULL").fetchone()["count"],
                "totalAdmins": connection.execute("SELECT COUNT(*) AS count FROM admins WHERE active = 1").fetchone()["count"],
                "openSupportMessages": connection.execute("SELECT COUNT(*) AS count FROM support_messages WHERE status IN ('open', 'in_progress')").fetchone()["count"],
            }
            nutritionists = connection.execute(
                "SELECT * FROM nutritionists ORDER BY created_at DESC"
            ).fetchall()
            admins = connection.execute(
                "SELECT * FROM admins WHERE active = 1 ORDER BY role DESC, name ASC"
            ).fetchall()
            support_messages = connection.execute(
                """
                SELECT support_messages.*, admins.name AS assigned_admin_name
                FROM support_messages
                LEFT JOIN admins ON admins.id = support_messages.assigned_admin_id
                ORDER BY support_messages.created_at DESC
                """
            ).fetchall()

        server_info = {
            "databaseFile": str(DB_PATH),
            "databaseSizeKb": round(DB_PATH.stat().st_size / 1024, 2) if DB_PATH.exists() else 0,
            "pythonVersion": platform.python_version(),
            "serverUptime": format_uptime(time.time() - STARTED_AT),
            "adminRole": admin["role"],
        }

        self.send_json(
            200,
            {
                "admin": admin_to_public_dict(admin),
                "stats": stats,
                "server": server_info,
                "nutritionists": [row_to_public_dict(row) for row in nutritionists],
                "admins": [admin_to_public_dict(row) for row in admins] if admin["role"] == "master" else [],
                "supportMessages": [support_message_to_public_dict(row) for row in support_messages]
                if admin["role"] in ["master", "support"] else [],
            },
        )

    def handle_change_nutritionist_status(self, status):
        # Somente ADMIN e ADMIN MASTER podem aprovar/desaprovar. SUPORTE nunca pode,
        # conforme a hierarquia definida no documento do projeto.
        admin = self.require_admin(["master", "admin"])
        if not admin:
            return

        try:
            nutritionist_id = int(self.path.split("/")[3])
            data = self.read_json_body()
        except (IndexError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"message": "Dados inválidos."})
            return

        reason = str(data.get("reason", "")).strip() if status == "rejected" else None
        message = "Cadastro aprovado com sucesso."

        if status == "rejected":
            message = "Cadastro desaprovado com sucesso."

        with get_connection() as connection:
            cursor = connection.execute(
                """
                UPDATE nutritionists
                SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (status, reason, nutritionist_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            self.send_json(404, {"message": "Cadastro não encontrado."})
            return

        self.send_json(200, {"message": message})

    def handle_contact_nutritionist(self):
        admin = self.require_admin()
        if not admin:
            return

        try:
            nutritionist_id = int(self.path.split("/")[3])
            data = self.read_json_body()
        except (IndexError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"message": "Dados inválidos."})
            return

        note = str(data.get("note", "")).strip()

        if not note:
            self.send_json(400, {"message": "Escreva uma observação de contato."})
            return

        with get_connection() as connection:
            cursor = connection.execute(
                """
                UPDATE nutritionists
                SET support_note = ?, contacted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (note, nutritionist_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            self.send_json(404, {"message": "Cadastro não encontrado."})
            return

        self.send_json(200, {"message": "Contato registrado no cadastro."})

    def handle_change_admin_role(self):
        admin = self.require_admin("master")
        if not admin:
            return

        try:
            admin_id = int(self.path.split("/")[3])
            data = self.read_json_body()
        except (IndexError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"message": "Dados inválidos."})
            return

        new_role = str(data.get("role", "")).strip()

        if new_role not in ["master", "admin", "support"]:
            self.send_json(400, {"message": "Cargo inválido."})
            return

        if admin_id == admin["id"] and new_role != "master":
            self.send_json(400, {"message": "O ADMIN MASTER não pode remover o próprio acesso master."})
            return

        with get_connection() as connection:
            cursor = connection.execute(
                "UPDATE admins SET role = ? WHERE id = ?",
                (new_role, admin_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            self.send_json(404, {"message": "Administrador não encontrado."})
            return

        self.send_json(200, {"message": "Cargo atualizado com sucesso."})

    def handle_support_reply(self):
        admin = self.require_admin(["master", "support"])
        if not admin:
            return

        try:
            message_id = int(self.path.split("/")[4])
            data = self.read_json_body()
        except (IndexError, ValueError, json.JSONDecodeError):
            self.send_json(400, {"message": "Dados inválidos."})
            return

        response = str(data.get("response", "")).strip()
        status = str(data.get("status", "in_progress")).strip()

        if not response:
            self.send_json(400, {"message": "Escreva uma resposta para o cliente."})
            return

        if status not in ["in_progress", "closed"]:
            self.send_json(400, {"message": "Status inválido."})
            return

        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM support_messages WHERE id = ?",
                (message_id,),
            ).fetchone()

            if not row:
                self.send_json(404, {"message": "Mensagem não encontrada."})
                return

            assigned_admin_id = row["assigned_admin_id"] or admin["id"]
            cursor = connection.execute(
                """
                UPDATE support_messages
                SET response = ?, status = ?, assigned_admin_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (response, status, assigned_admin_id, message_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            self.send_json(404, {"message": "Mensagem não encontrada."})
            return

        self.send_json(200, {"message": "Resposta registrada no atendimento."})


def main():
    setup_database()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), NutriHandler)
    print(f"Servidor iniciado em http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
