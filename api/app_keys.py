from collections import OrderedDict

from aiohttp import web

from config import Config

# Define Typed Keys for Aiohttp App
CONFIG_KEY = web.AppKey("config", Config)
DB_KEY = web.AppKey("db", object)  # aiosqlite.Connection
SCHEDULER_KEY = web.AppKey("scheduler", object)
USER_CACHE_KEY = web.AppKey("user_cache", OrderedDict)
HTTP_SESSION_KEY = web.AppKey("http_session", object)
TRANSLATOR_KEY = web.AppKey("translator", object)
