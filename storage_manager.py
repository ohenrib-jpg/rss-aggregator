import os, glob, datetime
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'analyses')

def ensure_data_dir():
    d = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'analyses'))
    os.makedirs(d, exist_ok=True)
    return d

def save_analysis_batch(batch):
    """Append to a daily parquet file"""
    ensure_data_dir()
    if not batch:
        return
    df = pd.DataFrame(batch)
    date = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'analyses', f'{date}.parquet'))
    try:
        if os.path.exists(path):
            table_old = pq.read_table(path)
            df_old = table_old.to_pandas()
            df_out = pd.concat([df_old, df], ignore_index=True)
        else:
            df_out = df
        table = pa.Table.from_pandas(df_out)
        pq.write_table(table, path, compression='snappy')
    except Exception as e:
        fallback = path + '.csv.gz'
        df.to_csv(fallback, index=False, compression='gzip')

def load_recent_analyses(days=7):
    ensure_data_dir()
    dirpath = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data', 'analyses'))
    files = sorted(glob.glob(os.path.join(dirpath, '*.parquet')), reverse=True)
    if not files:
        return None
    tables = []
    for p in files[:days]:
        try:
            t = pq.read_table(p)
            tables.append(t.to_pandas())
        except Exception:
            continue
    if not tables:
        return None
    import pandas as pd
    return pd.concat(tables, ignore_index=True)

def summarize_analyses(df):
    if df is None or len(df)==0:
        return {}
    out = {}
    out['count'] = len(df)
    out['mean_confidence'] = float(df.get('confidence', df.get('confidence', None)).mean()) if 'confidence' in df else None
    out['median_confidence'] = float(df.get('confidence', df.get('confidence', None)).median()) if 'confidence' in df else None
    out['mean_bayesian'] = float(df.get('bayesian_posterior', df.get('bayesian_posterior', None)).mean()) if 'bayesian_posterior' in df else None
    return out
