# RPG Codex

A browser-based RPG development database. Data is stored locally in the browser unless the user exports a backup.

## Current features
- Interconnected records, tags, properties, and related records.
- Independent local projects, with create, rename, switch, and delete actions.
- JSON backup export and validated import (replace or merge mode).
- Trash with record restoration and recovery of incoming relationships.
- A 100-icon minimalist vector library, searchable by icon name and theme, plus support for custom emoji/text icons.
- Persistent list/grid preference and defensive loading/saving of existing records.

## Run
Open `index.html` through a local static web server or publish the repository as a static site (for example, GitHub Pages). The icon library uses Lucide from its CDN, so vector icons require an internet connection; records and project data remain in browser local storage.

## Data warning
Browser local storage is local to the browser/profile and does not automatically synchronize between devices. Export JSON backups regularly before clearing browser data or deleting a project.
