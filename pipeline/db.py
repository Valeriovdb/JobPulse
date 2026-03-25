"""
Supabase client singleton.
"""
from typing import Optional
from supabase import create_client, Client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client
