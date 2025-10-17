# DB Manager placeholder filled
import sqlite3
def get_connection(db_path='data.sqlite'):
    return sqlite3.connect(db_path)
