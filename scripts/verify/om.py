"""Open-Meteo fetch with retries (shared egress IPs often hit the daily limit) and a disk cache."""
import hashlib, json, os, sys, time, urllib.parse, urllib.request, concurrent.futures as cf

CACHE = os.path.join(os.environ.get('VERIFY_OUT', 'verify-out'), 'cache')
os.makedirs(CACHE, exist_ok=True)

def fetch(base, params, attempts=60):
    url = base + '?' + urllib.parse.urlencode(params)
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, key + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                body = r.read()
            d = json.loads(body)
            if isinstance(d, dict) and d.get('error'):
                last = d.get('reason')
                if 'limit' not in str(last).lower():
                    raise RuntimeError(f'{last} :: {url}')
                time.sleep(0.5)
                continue
            json.dump(d, open(path, 'w'))
            return d
        except urllib.error.HTTPError as e:
            try:
                last = json.loads(e.read()).get('reason')
            except Exception:
                last = str(e)
            if e.code == 400:
                raise RuntimeError(f'{last} :: {url}')
            time.sleep(0.5)
        except RuntimeError:
            raise
        except Exception as e:
            last = str(e)
            time.sleep(0.5)
    raise RuntimeError(f'gave up: {last} :: {url}')

def fetch_many(jobs, workers=6):
    """jobs: list of (base, params). Returns list of results or exceptions."""
    out = [None] * len(jobs)
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fetch, b, p): i for i, (b, p) in enumerate(jobs)}
        for f in cf.as_completed(futs):
            i = futs[f]
            try:
                out[i] = f.result()
            except Exception as e:
                out[i] = e
    return out
