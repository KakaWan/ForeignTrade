"""Simple in-memory cache with TTL support."""

import time
from collections import OrderedDict
from threading import Lock
from typing import Any, Optional

from app.core.config import settings


class TTLCache:
    """Thread-safe LRU cache with time-to-live expiration."""

    def __init__(self, max_size: int = 1000, ttl: int = 300):
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._lock = Lock()
        self._max_size = max_size
        self._ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            value, expires_at = self._cache[key]
            if time.time() > expires_at:
                del self._cache[key]
                return None
            self._cache.move_to_end(key)
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        expires_at = time.time() + (ttl or self._ttl)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (value, expires_at)
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed items."""
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [
                k for k, (_, exp) in self._cache.items() if now > exp
            ]
            for k in expired_keys:
                del self._cache[k]
                removed += 1
        return removed


# Global cache instance
cache = TTLCache(
    max_size=settings.cache_max_size,
    ttl=settings.cache_ttl,
)
