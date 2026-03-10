document.addEventListener("DOMContentLoaded", function () {

  const menuItems = document.querySelectorAll(".menu-item");
  const previewImage = document.getElementById("preview-image");
  const launchLink = document.getElementById("launch-link");
  const description = document.getElementById("app-description");

  menuItems.forEach(item => {
    item.addEventListener("click", function () {

      menuItems.forEach(i => i.classList.remove("active"));
      this.classList.add("active");

      const appName = this.dataset.app;

      if (appName === "color-filters") {
        previewImage.src = "images/color-filters-preview.png";
        launchLink.href = "apps/color-filters/index.html";
        description.textContent =
          "Interactive RGB and subtractive filter exploration tool.";
      }

      if (appName === "color-mixing") {
        previewImage.src = "images/color-mixing-preview.png";
        launchLink.href = "apps/color-mixing/index.html";
        description.textContent =
          "Explore additive (RGB) and subtractive (CMY) color mixing using interactive Venn diagrams.";
      }

      if (appName === "graphics-calculator") {
        previewImage.src = "images/graphics-calc-preview.png";
        launchLink.href = "apps/graphics-calculator/index.html";
        description.textContent =
          "Interactive graphing calculator for plotting and exploring mathematical functions.";
      }

      if (appName === "snells-law") {
        previewImage.src = "images/snells-law-preview.png";
        launchLink.href = "apps/snells-law/index.html";
        description.textContent =
          "Investigate refraction using an interactive Snell's Law simulator. Includes a downloadable lab guide.";
      }

    });
  });

});

