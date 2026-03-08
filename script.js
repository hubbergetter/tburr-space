const menuItems = document.querySelectorAll(".menu-item");
const previewImage = document.getElementById("preview-image");
const launchLink = document.getElementById("launch-link");
const description = document.getElementById("app-description");

menuItems.forEach(item => {
item.addEventListener("click", function () {

```
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
      "Explore additive RGB and subtractive CMY color mixing with interactive controls.";
}

if (appName === "graphics-calculator") {
    previewImage.src = "images/graphics-calc-preview.png";
    launchLink.href = "apps/graphics-calculator/index.html";
    description.textContent =
       "Dynamic function graphing tool with trace and intersection modes.";
}
```

});
});

