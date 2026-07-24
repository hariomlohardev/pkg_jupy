"""
main.py - Direct entry point to launch Jupy locally without package installation.
Run with: python main.py
"""
import os
import sys

# Ensure local package path is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from jupy.cli import main

if __name__ == "__main__":
    main()