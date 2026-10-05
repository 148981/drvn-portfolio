import ast
from pathlib import Path
import sqlite3
import tempfile
import unittest

class RecentPortionsTest(unittest.TestCase):
    def test_latest_row_and_per_100g_round_trip(self):
        # Load only the real function; the module's import-time init_db must
        # never open the user's nutrition database during this regression.
        source = Path(__file__).resolve().parents[1] / 'core/nutrition_db.py'
        tree = ast.parse(source.read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'get_recent_foods')
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / 'test.db')
            def connect():
                connection = sqlite3.connect(path)
                connection.row_factory = sqlite3.Row
                return connection
            with connect() as db:
                db.execute('CREATE TABLE nutrition_logs(id INTEGER, user_id TEXT, name TEXT, calories REAL, protein REAL, carbs REAL, fats REAL, fiber REAL, grams REAL, is_tfda INTEGER, is_global INTEGER, timestamp TEXT)')
                db.executemany('INSERT INTO nutrition_logs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[
                    (1,'u','飯',600,9,130,2,3,400,0,0,'2026-09-06'),
                    (2,'u','飯',240,4,52,1,1,200,0,0,'2026-09-07'),
                    (3,'other','飯',999,99,99,99,9,100,0,0,'2026-09-08'),
                    (4,'u','零份量',100,1,1,1,1,0,0,0,'2026-09-08'),
                ])
            namespace = {'get_db_connection': connect}
            exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
            foods = namespace['get_recent_foods']('u')
            self.assertEqual(len(foods),1)
            food=foods[0]
            self.assertEqual(food['calories'],120)
            self.assertEqual(food['protein'],2)
            self.assertEqual(food['serving_size_g'],200)
            self.assertEqual(food['calories']*food['serving_size_g']/100,240)
            self.assertEqual(food['id'],'recent_2')

if __name__ == '__main__':
    unittest.main()
