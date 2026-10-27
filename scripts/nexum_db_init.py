from __future__ import annotations

import argparse
import sys

import nexum_auth_store
import nexum_db


def main() -> int:
    parser = argparse.ArgumentParser(description="Inicializa la base MongoDB de NEXUM AI")
    parser.add_argument("--estado", action="store_true", help="solo muestra el estado de la base")
    parser.add_argument("--reset", action="store_true", help="borra la base nexum_ai antes de crearla")
    args = parser.parse_args()

    print(f"MongoDB: {nexum_db.safe_uri()}  base: {nexum_db.DB_NAME}")
    if not nexum_db.ping():
        print("ERROR: no hay conexion con MongoDB. Inicia el servicio (mongod) o ajusta NEXUM_MONGO_URI.")
        return 1

    if not args.estado:
        if args.reset:
            nexum_db.client().drop_database(nexum_db.DB_NAME)
            print(f"Base {nexum_db.DB_NAME} eliminada")
        if not nexum_db.ensure_ready(force=True):
            return 1
        creados = nexum_auth_store.seed_users()
        print(f"Usuarios de prueba creados: {creados}")

    info = nexum_db.status()
    print(f"Colecciones: {info.get('collections', 0)}")
    for name, count in info.get("documentos", {}).items():
        print(f"  {name:<32} {count:>6}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
