import asyncio
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

MAP_URL = "https://cta.woodmac.com/natgas/images#3/42/-97"
IMAGE_HOST = "genimages.blob.core.windows.net"
IMAGE_PATH_MARKER = "/irimageimages/"
OUTPUT_DIR = Path("woodmac_images")
REFRESH_SECONDS = 300  # 5 minutes


async def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    saved_paths = set()

    async with async_playwright() as playwright:
        # This creates a separate browser profile and keeps its sign-in between runs.
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir="woodmac_edge_profile",
            channel="msedge",
            headless=False,
        )

        page = context.pages[0] if context.pages else await context.new_page()

        async def save_image_response(response):
            parsed = urlparse(response.url)

            if (
                response.request.method != "GET"
                or parsed.netloc != IMAGE_HOST
                or IMAGE_PATH_MARKER not in parsed.path
                or not parsed.path.lower().endswith(".jpg")
                or response.status != 200
            ):
                return

            # Keep the image's folder structure, but don't save the signed query string.
            parts = Path(parsed.path).parts
            marker_index = parts.index("irimageimages")
            relative_path = Path(*parts[marker_index + 1:])
            destination = OUTPUT_DIR / relative_path

            if relative_path in saved_paths or destination.exists():
                return

            try:
                image_bytes = await response.body()
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(image_bytes)
                saved_paths.add(relative_path)
                print(f"Saved {destination}")
            except Exception as error:
                print(f"Could not save an image: {error}")

        page.on("response", lambda response: asyncio.create_task(
            save_image_response(response)
        ))

        await page.goto(MAP_URL)

        await asyncio.to_thread(
            input,
            "Sign in to WoodMac in the opened browser if needed, then press Enter here..."
        )

        # Reopen the map after sign-in and collect image responses as they arrive.
        await page.goto(MAP_URL)
        print(f"Collecting images into: {OUTPUT_DIR.resolve()}")

        try:
            while True:
                await page.wait_for_timeout(REFRESH_SECONDS * 1000)
                await page.reload(wait_until="domcontentloaded")
        except KeyboardInterrupt:
            await context.close()


asyncio.run(main())