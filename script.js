const menuItems = document.querySelectorAll(".menu-item");
const previewImage = document.getElementById("preview-image");
const launchLink = document.getElementById("launch-link");

menuItems.forEach(item => {
  item.addEventListener("click", function () {

    // Remove active class from all
    menuItems.forEach(i => i.classList.remove("active"));

    // Add active to clicked
    this.classList.add("active");

    const appName = this.dataset.app;

    if (appName === "color-filters") {
      previewImage.src = "images/color-filters-preview.png";
      launchLink.href = "apps/color-filters/index.html";
    }

  });
});