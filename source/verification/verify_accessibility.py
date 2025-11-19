from playwright.sync_api import sync_playwright, expect
import os

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the local server
    page.goto('http://localhost:8000/public/index.html')

    # 1. Switch to the episodes tab of the default project
    episodes_tab = page.get_by_role("button", name="Episodes")
    expect(episodes_tab).to_be_visible()
    episodes_tab.click()

    # 2. Add a new episode
    page.get_by_role("button", name="Add Episode").click()

    # 3. Verify that the new episode's input field is focused
    new_episode_input = page.locator(".list-item:nth-child(1) input.inline-input")
    expect(new_episode_input).to_be_focused()

    # 4. Verify the ARIA label on the delete button
    delete_button = page.locator(".list-item:nth-child(1) button[data-action='del']")
    expect(delete_button).to_have_attribute("aria-label", "Delete Episode")

    # 5. Take a screenshot for visual confirmation
    page.screenshot(path="accessibility_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run_verification(playwright)