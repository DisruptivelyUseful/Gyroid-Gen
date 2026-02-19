<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1wFL9N4vo7xFCvZ2WODVFcNqKM69_svQa

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This repository is configured to automatically deploy to GitHub Pages using GitHub Actions.

### Setup Instructions

1. **Enable GitHub Pages in your repository:**
   - Go to your repository settings on GitHub
   - Navigate to "Pages" in the left sidebar
   - Under "Source", select "GitHub Actions"
   - Save the settings

2. **Configure the base path (if needed):**
   - If your repository name is different from "Gyroid-Gen", update the `VITE_BASE_PATH` in `.github/workflows/deploy.yml`
   - If your site is at `username.github.io/repo-name`, use `/repo-name/`
   - If it's a user/organization page at the root (`username.github.io`), use `/`

3. **Push to main/master branch:**
   - The GitHub Actions workflow will automatically build and deploy your app
   - You can also manually trigger it from the "Actions" tab

4. **Access your deployed app:**
   - After deployment, your app will be available at `https://username.github.io/Gyroid-Gen/` (or your configured path)

### Manual Build

To build locally:
```bash
npm run build
```

The built files will be in the `dist/` directory.
