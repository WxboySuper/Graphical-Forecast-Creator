"""Command entry point and compatibility exports for mesoscale ingest."""
from ingestion import *
from ingestion.cli import build_parser, main

if __name__ == "__main__":
    main()
