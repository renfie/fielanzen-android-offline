# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 René Fieler (RenFie)
#
# This program is free software under the GNU GPL v2.
# See LICENSE for the complete license text.

"""Smoke test for browser preview with real Chromium + IndexedDB, offline server simulation."""
from __future__ import annotations
import json
import tempfile
import threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'preview')))
thread=threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
url=f'http://127.0.0.1:{server.server_port}'

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(accept_downloads=True,locale='de-DE')
        page=context.new_page()
        errs=[]
        page.on('pageerror',lambda err:errs.append(str(err)))
        page.goto(url,wait_until='networkidle')
        page.get_by_role('heading',name='Übersicht').wait_for()
        page.locator('.wolf-logo').wait_for()
        assert page.locator('.wolf-logo').evaluate('(el)=>el.complete && el.naturalWidth>0'), 'logo missing'
        assert page.locator('.logo-fallback').evaluate('(el)=>getComputedStyle(el).visibility')=='hidden'
        page.locator('[data-action="add-account"]').first.click()
        page.locator('#account-name').fill('Girokonto')
        page.locator('#account-opening').fill('1000,00')
        page.locator('dialog [type="submit"]').click()
        page.get_by_text('1.000,00 €').first.wait_for()
        page.locator('[data-action="go-settings"]').first.click()
        page.locator('[data-action="add-category"]').first.click()
        page.locator('#cat-name').fill('Lebensmittel')
        page.locator('dialog [type="submit"]').click()
        page.locator('[data-action="go-home"]').first.click()
        page.locator('[data-action="add-booking"]').first.click()
        page.locator('#book-amount').fill('11,00')
        page.locator('#book-category').select_option(label='Lebensmittel')
        page.locator('#book-payee').fill('Rewe')
        page.locator('dialog [type="submit"]').click()
        page.locator('[data-action="go-settings"]').first.click()
        page.locator('[data-action="edit-account"]').first.click()
        page.locator('#account-name').fill('Gehaltskonto')
        page.locator('dialog [type="submit"]').click()
        page.get_by_text('Gehaltskonto').first.wait_for()
        page.locator('[data-action="edit-category"]').first.click()
        page.locator('#cat-name').fill('Lebensmittel & Getränke')
        page.locator('dialog [type="submit"]').click()
        page.get_by_text('Lebensmittel & Getränke').first.wait_for()
        # referenced entities should not delete (error shown)
        page.locator('[data-action="edit-category"]').first.click()
        page.once('dialog',lambda d:d.accept())
        page.locator('#remove-category').click()
        page.locator('dialog #dialog-error').get_by_text('wird von Buchungen verwendet',exact=False).wait_for()
        page.locator('dialog .close-modal').first.click()
        with page.expect_download() as entry:
            page.locator('[data-action="export-backup"]').click()
        download=entry.value
        backup_path=Path(tempfile.mktemp(suffix='.json'))
        download.save_as(str(backup_path))
        source=backup_path.read_text(encoding='utf8')
        backup=json.loads(source)
        assert backup['format']=='fielanzen-offline'
        assert len(backup['data']['bookings'])==1
        assert backup['data']['accounts'][0]['name']=='Gehaltskonto'
        page.locator('[data-action="go-bookings"]').first.click()
        page.locator('[data-action="toggle-booking"]').first.click()
        page.once('dialog',lambda d:d.accept())
        page.locator('[data-action="delete-booking"]').first.click()
        page.get_by_text('Noch keine passenden Buchungen vorhanden.').wait_for()
        page.locator('[data-action="go-settings"]').first.click()
        page.locator('#backup-restore-input').set_input_files(str(backup_path))
        page.get_by_text('1 Buchungen').first.wait_for()
        page.locator('#restore-confirm').fill('WIEDERHERSTELLEN')
        page.locator('dialog [type="submit"]').click()
        page.get_by_text('Sicherung erfolgreich wiederhergestellt.').wait_for()
        page.reload(wait_until='networkidle')
        page.locator('[data-action="go-bookings"]').first.click()
        page.get_by_text('Rewe').first.wait_for()
        assert len(page.locator('.booking-entry').all()) == 1
        assert not errs, errs
        print('E2E PASS: logo, account/category, booking, guarded deletion, JSON download, restore, persistent IndexedDB')
        context.close();browser.close()
finally:
    server.shutdown()
