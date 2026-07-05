"""
Cria (ou corrige) uma conta de nutricionista de teste, já com status "approved",
para você conseguir acessar o painel do nutricionista (dashboard.html) sem precisar
passar pelo fluxo de cadastro + aprovação manualmente.

Como usar:
1. Coloque este arquivo na MESMA pasta onde está o server.py e o nutritionists.sqlite.
2. Rode: python3 criar_nutricionista_teste.py
3. Use o login abaixo em login.html:

   CRN:   TESTE-NUTRI
   Senha: teste123

Pode rodar esse script quantas vezes quiser — ele nunca duplica a conta nem
afeta os outros cadastros que já existem no banco.
"""

import hashlib
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "nutritionists.sqlite"

TEST_CRN = "TESTE-NUTRI"
TEST_PASSWORD = "teste123"
TEST_DATA = {
    "name": "Nutricionista Teste",
    "cpf": "000.000.000-00",
    "birth_date": "1990-01-01",
    "crn": TEST_CRN,
    "crn_region": "CRN-1",
    "email": "teste@nutricionista.com",
}


def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def main():
    if not DB_PATH.exists():
        print(f"Banco não encontrado em {DB_PATH}.")
        print("Coloque este script na mesma pasta do nutritionists.sqlite e do server.py.")
        return

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    existing = connection.execute(
        "SELECT id FROM nutritionists WHERE crn = ?", (TEST_CRN,)
    ).fetchone()

    password_hash = hash_password(TEST_PASSWORD)

    if existing:
        connection.execute(
            """
            UPDATE nutritionists
            SET name = ?, cpf = ?, birth_date = ?, crn_region = ?, email = ?,
                password_hash = ?, status = 'approved', rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE crn = ?
            """,
            (
                TEST_DATA["name"],
                TEST_DATA["cpf"],
                TEST_DATA["birth_date"],
                TEST_DATA["crn_region"],
                TEST_DATA["email"],
                password_hash,
                TEST_CRN,
            ),
        )
        print("Conta de teste já existia — atualizada e aprovada novamente.")
    else:
        connection.execute(
            """
            INSERT INTO nutritionists
            (name, cpf, birth_date, crn, crn_region, email, password_hash, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
            """,
            (
                TEST_DATA["name"],
                TEST_DATA["cpf"],
                TEST_DATA["birth_date"],
                TEST_CRN,
                TEST_DATA["crn_region"],
                TEST_DATA["email"],
                password_hash,
            ),
        )
        print("Conta de teste criada com sucesso e já aprovada.")

    connection.commit()
    connection.close()

    print()
    print("Use em login.html:")
    print(f"  CRN:   {TEST_CRN}")
    print(f"  Senha: {TEST_PASSWORD}")


if __name__ == "__main__":
    main()
