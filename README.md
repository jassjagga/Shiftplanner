# ShiftSheet — GitHub Pages edition

Upload schedule photos, preview the department sheet, and download PDF or Excel. Times use **7AM-3PM** or **6:45AM-3:15PM**. Unclear entries are highlighted yellow.

## Put it on GitHub Pages

1. Create a **public repository** on GitHub, for example `shiftsheet`.
2. Unzip this download. Upload the **contents** into the repository: `index.html`, the JavaScript/CSS files, and the entire `vendor` folder. Put `index.html` directly at the repository root. Do not upload just the ZIP or an extra enclosing folder.
3. In the repository, go to **Settings → Pages**.
4. Set **Source** to **Deploy from a branch**, choose **main** and **/(root)**, then **Save**.
5. Wait for deployment. GitHub shows your site link on that Pages screen; share that link with friends.

For a repository named `shiftsheet`, the link normally looks like `https://YOUR-USERNAME.github.io/shiftsheet/`. Replace YOUR-USERNAME with your GitHub username. This is an example URL, not an already-published site.

GitHub Free supports Pages for public repositories. Setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Hosting details

This is a complete static website. No build command, Node installation, backend, API key, ChatGPT login, or paid OCR service is needed. The same files can also be hosted on Netlify, Cloudflare Pages, or another static host.

Keep the included `vendor` files: they contain the on-device photo reader, English model, PDF tools, and Excel tools. Asset paths support both a domain root and GitHub Pages repository subfolders. The included `.nojekyll` file disables Jekyll processing when GitHub publishes the files.

Photos are read on each visitor's device. The website does not upload report photos to GitHub or a remote OCR service. Each visitor's latest sheet is kept in that browser's local storage. No sample schedules, uploaded photos, account identifiers, credentials, or ChatGPT hosting configuration are included in this package.

To test locally, serve this folder over HTTP, for example with `python3 -m http.server 8000`, and open `http://localhost:8000/`. Opening `index.html` directly with a file:// URL will not run browser modules and workers correctly.

## Downloads

The PDF is ready for landscape printing. The Excel workbook includes a formatted Shift Plan and an editable Associates sheet. Names, times, and areas in the plan use formulas linked to Associates, so those changes carry through when Excel recalculates. Check the yellow cells against the source reports before using the final plan.

## Included libraries

Tesseract.js/core 7.0.0, OpenCV.js 5.0.0-release.1, pdf-lib 1.17.1, and JSZip 3.10.1. Their license files are included in `vendor/`.
