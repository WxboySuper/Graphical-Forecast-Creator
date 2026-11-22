"""Command entry point and compatibility exports for mesoscale ingest."""
from ingestion.cli import build_parser, main
from ingestion.catalog import validate_catalog
from ingestion.discovery import discover_cycle
from ingestion.fields import MODELS
from ingestion.publish import publish_cycle
from ingestion.render import colorize
from ingestion.store import LocalStore

if __name__ == "__main__":
    main()
