"""
On-disk theme store — the single source of truth shared by CLI and web UI.

Layout under <data_dir>/themes:
    config.json                 { active, registry_url, cache_ttl_seconds }
    registry.cache.json         cached registry.json + fetched_at
    installed/<unique_name>/
        theme.yml  about.json  preview.png  install.json
"""
import hashlib
import json
import os
import shutil
import time

from .schema import ThemeError, parse_theme, validate_theme
from .registry import RegistryClient, get_registry_url, DEFAULT_TTL_SECONDS

DEFAULT_ACTIVE = "__default__"


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class ThemeStore:
    def __init__(self, base_dir=None):
        if base_dir is None:
            from jupy.core import envmanager
            base_dir = os.path.join(envmanager.get_data_dir(), "themes")
        self.base_dir = base_dir
        self.installed_dir = os.path.join(base_dir, "installed")
        self.config_path = os.path.join(base_dir, "config.json")
        os.makedirs(self.installed_dir, exist_ok=True)

        cfg = self._load_config()
        self.registry = RegistryClient(
            cache_path=os.path.join(base_dir, "registry.cache.json"),
            registry_url=cfg.get("registry_url") or get_registry_url(),
            ttl=cfg.get("cache_ttl_seconds", DEFAULT_TTL_SECONDS),
        )

    # ---- config ----
    def _load_config(self):
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"active": DEFAULT_ACTIVE}

    def _save_config(self, cfg):
        os.makedirs(self.base_dir, exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

    def get_active_name(self):
        return self._load_config().get("active", DEFAULT_ACTIVE)

    def set_active(self, unique_name):
        if unique_name != DEFAULT_ACTIVE and not self.is_installed(unique_name):
            raise ThemeError(f"Theme '{unique_name}' is not installed.")
        cfg = self._load_config()
        cfg["active"] = unique_name
        self._save_config(cfg)
        return unique_name

    def reset_active(self):
        return self.set_active(DEFAULT_ACTIVE)

    # ---- paths ----
    def _theme_dir(self, unique_name):
        safe = "".join(c for c in unique_name if c.isalnum() or c in ("-", "_"))
        return os.path.join(self.installed_dir, safe)

    def preview_path(self, unique_name):
        return os.path.join(self._theme_dir(unique_name), "preview.png")

    def _install_meta_path(self, unique_name):
        return os.path.join(self._theme_dir(unique_name), "install.json")

    def is_installed(self, unique_name):
        return os.path.isfile(os.path.join(self._theme_dir(unique_name), "theme.yml"))

    # ---- read ----
    def get_theme(self, unique_name):
        path = os.path.join(self._theme_dir(unique_name), "theme.yml")
        if not os.path.isfile(path):
            raise ThemeError(f"Theme '{unique_name}' is not installed.")
        with open(path, "r", encoding="utf-8") as f:
            return parse_theme(f.read(), "theme.yml")

    def _read_install_meta(self, unique_name):
        try:
            with open(self._install_meta_path(unique_name), "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _read_about(self, unique_name):
        try:
            with open(os.path.join(self._theme_dir(unique_name), "about.json"), "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def list_installed(self):
        active = self.get_active_name()
        out = []
        try:
            names = sorted(os.listdir(self.installed_dir))
        except Exception:
            names = []
        for name in names:
            if not self.is_installed(name):
                continue
            theme = {}
            try:
                theme = self.get_theme(name)
            except Exception:
                pass
            meta = self._read_install_meta(name)
            about = self._read_about(name)
            out.append({
                "unique_name": name,
                "name": theme.get("name", name),
                "author": theme.get("author") or about.get("author"),
                "version": meta.get("version"),
                "source": meta.get("source", "unknown"),
                "installed_at": meta.get("installed_at"),
                "active": name == active,
            })
        return out

    def get_active_theme(self):
        active = self.get_active_name()
        if active == DEFAULT_ACTIVE or not self.is_installed(active):
            return {"unique_name": DEFAULT_ACTIVE, "is_default": True, "theme": None, "meta": {}}
        return {
            "unique_name": active,
            "is_default": False,
            "theme": self.get_theme(active),
            "meta": self._read_about(active),
        }

    # ---- install / import ----
    def install(self, unique_name, activate=False, on_progress=None):
        def progress(m):
            if on_progress:
                on_progress(m)

        progress(f"Looking up '{unique_name}' in the registry…")
        meta = self.registry.find_theme(unique_name)
        urls = meta.get("urls", {})
        if not urls.get("yml"):
            raise ThemeError(f"Registry entry for '{unique_name}' has no theme.yml URL.")

        progress("Downloading theme.yml…")
        yml_text = self.registry.download_text(urls["yml"])
        theme = parse_theme(yml_text, "theme.yml")
        ok, errors, _warnings = validate_theme(theme)
        if not ok:
            raise ThemeError("Invalid theme:\n  " + "\n  ".join(errors))

        about = {}
        if urls.get("about"):
            try:
                about = json.loads(self.registry.download_text(urls["about"]))
            except Exception:
                pass

        preview_bytes = None
        if urls.get("preview"):
            try:
                preview_bytes = self.registry.download_bytes(urls["preview"])
            except Exception:
                pass

        self._write_theme_dir(unique_name, yml_text, about, preview_bytes, {
            "unique_name": unique_name,
            "source": "registry",
            "version": meta.get("version"),
            "installed_at": _now_iso(),
            "registry_url": self.registry.registry_url,
            "checksum_sha256": hashlib.sha256(yml_text.encode("utf-8")).hexdigest(),
        })

        if activate:
            self.set_active(unique_name)
        progress(f"Installed '{meta.get('name', unique_name)}'.")
        return meta

    def install_from_text(self, text, filename="theme.yml", unique_name=None, activate=False):
        theme = parse_theme(text, filename)
        ok, errors, _w = validate_theme(theme)
        if not ok:
            raise ThemeError("Invalid theme:\n  " + "\n  ".join(errors))
        name = unique_name or theme.get("name") or "custom-theme"
        slug = "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in str(name)).strip("-").lower() or "custom-theme"
        self._write_theme_dir(slug, text, {"name": theme.get("name")}, None, {
            "unique_name": slug,
            "source": "local",
            "version": theme.get("version"),
            "installed_at": _now_iso(),
            "checksum_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        })
        if activate:
            self.set_active(slug)
        return {"unique_name": slug, "name": theme.get("name", slug)}

    def _write_theme_dir(self, unique_name, yml_text, about, preview_bytes, install_meta):
        d = self._theme_dir(unique_name)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "theme.yml"), "w", encoding="utf-8") as f:
            f.write(yml_text)
        with open(os.path.join(d, "about.json"), "w", encoding="utf-8") as f:
            json.dump(about or {}, f, indent=2)
        if preview_bytes:
            with open(os.path.join(d, "preview.png"), "wb") as f:
                f.write(preview_bytes)
        with open(self._install_meta_path(unique_name), "w", encoding="utf-8") as f:
            json.dump(install_meta, f, indent=2)

    # ---- uninstall ----
    def uninstall(self, unique_name):
        if not self.is_installed(unique_name):
            raise ThemeError(f"Theme '{unique_name}' is not installed.")
        if self.get_active_name() == unique_name:
            self.reset_active()
        shutil.rmtree(self._theme_dir(unique_name), ignore_errors=True)
        return True

    # ---- export ----
    def export_theme(self, unique_name):
        path = os.path.join(self._theme_dir(unique_name), "theme.yml")
        if not os.path.isfile(path):
            raise ThemeError(f"Theme '{unique_name}' is not installed.")
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    # ---- updates ----
    def check_updates(self):
        updates = []
        try:
            registry_themes = {t.get("unique_name"): t for t in self.registry.get_themes()}
        except ThemeError:
            return updates
        for item in self.list_installed():
            name = item["unique_name"]
            reg = registry_themes.get(name)
            if reg and str(reg.get("version")) != str(item.get("version")):
                updates.append({
                    "unique_name": name,
                    "installed_version": item.get("version"),
                    "registry_version": reg.get("version"),
                })
        return updates

    def update(self, unique_name):
        was_active = self.get_active_name() == unique_name
        return self.install(unique_name, activate=was_active)

    def update_all(self, on_progress=None):
        updated = []
        for u in self.check_updates():
            if on_progress:
                on_progress(f"Updating {u['unique_name']}…")
            self.update(u["unique_name"])
            updated.append(u["unique_name"])
        return updated

    # ---- preview remote fallback ----
    def preview_remote_url(self, unique_name):
        try:
            meta = self.registry.find_theme(unique_name)
            return (meta.get("urls") or {}).get("preview")
        except Exception:
            return None