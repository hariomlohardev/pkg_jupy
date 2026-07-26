from playwright.sync_api import sync_playwright, TimeoutError
import time

STEALTH_JS = """
// Overwrite navigator.webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => false });

// Overwrite chrome object
window.chrome = { runtime: {} };

// Overwrite plugins array length
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

// Overwrite languages
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
"""

with sync_playwright() as p:
    browser = p.chromium.launch_persistent_context(
        user_data_dir="./deepseek_profile",
        headless=False,
        channel="chrome",
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ]
    )

    if browser.pages:
        page = browser.pages[0]
    else:
        page = browser.new_page()

    # Inject stealth script before the page loads
    page.add_init_script(STEALTH_JS)

    page.goto("https://chat.deepseek.com")

    # … (rest is identical to the script above)
    # Copy the login wait + chat loop from Solution 1 here