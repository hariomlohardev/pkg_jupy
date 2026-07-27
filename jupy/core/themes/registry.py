"""
Client for the themes_jupy registry (a GitHub repo exposing registry.json).
Uses only the standard library (urllib) so Jupy stays dependency-light.
"""
import json
import os
import time
import urllib.request
import urllib.error

from .schema import ThemeError

DEFAULT_REGISTRY_URL = (
    "https://raw.githubusercontent.com/hariomlohardev/themes_jupy/main/registry.json"
)
DEFAULT_TTL_SECONDS = 3600
_USER_AGENT = "Jupy-ThemeStore/1.0"


def get_registry_url():
    return os.environ.get("JUPY_THEME_REGISTRY") or DEFAULT_REGISTRY_URL


def _http_get(url, timeout=15, as_bytes=False):
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        raise ThemeError(f"HTTP {e.code} fetching {url}")
    except Exception as e:
        raise ThemeError(f"Could not reach {url}: {e}")
    return raw if as_bytes else raw.decode("utf-8", errors="replace")


class RegistryClient:
    def __init__(self, cache_path, registry_url=None, ttl=DEFAULT_TTL_SECONDS):
        self.cache_path = cache_path
        self.registry_url = registry_url or get_registry_url()
        self.ttl = ttl

    def _read_cache(self):
        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _write_cache(self, registry):
        try:
            os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump({"fetched_at": time.time(), "registry": registry}, f)
        except Exception:
            pass

    def _cache_is_fresh(self, cached):
        if not cached or "fetched_at" not in cached:
            return False
        return (time.time() - cached["fetched_at"]) < self.ttl

    def fetch_registry(self, force=False):
        cached = self._read_cache()
        if not force and self._cache_is_fresh(cached):
            return cached["registry"]
        try:
            registry = json.loads(_http_get(self.registry_url))
        except ThemeError:
            if cached and "registry" in cached:
                return cached["registry"]
            raise
        self._write_cache(registry)
        return registry

    def get_cached_registry(self):
        cached = self._read_cache()
        if cached and "registry" in cached:
            return cached["registry"]
        return self.fetch_registry(force=False)

    def get_themes(self, force=False):
        registry = self.fetch_registry(force=force)
        return registry.get("themes", []) if isinstance(registry, dict) else []

    def find_theme(self, unique_name, force=False):
        for t in self.get_themes(force=force):
            if t.get("unique_name") == unique_name:
                return t
        raise ThemeError(f"Theme '{unique_name}' not found in the registry.")

    def search(self, query):
        q = (query or "").lower().strip()
        if not q:
            return self.get_themes()
        out = []
        for t in self.get_themes():
            hay = " ".join([
                str(t.get("unique_name", "")),
                str(t.get("name", "")),
                str(t.get("description", "")),
                " ".join(t.get("tags", []) or []),
            ]).lower()
            if q in hay:
                out.append(t)
        return out

    def download_text(self, url):
        return _http_get(url)

    def download_bytes(self, url):
        return _http_get(url, as_bytes=True)