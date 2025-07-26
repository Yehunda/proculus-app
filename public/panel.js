// Wait for DOM to fully load
document.addEventListener("DOMContentLoaded", function () {
  const menuLinks = document.querySelectorAll(".sidebar nav a");
  const contentArea = document.querySelector(".content");

  // Basic navigation simulation
  menuLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const page = this.getAttribute("data-page");
      loadContent(page);
    });
  });

  function loadContent(page) {
    contentArea.innerHTML = `<h2>Loading ${page}...</h2>`;
    
    // Simulate async loading
    setTimeout(() => {
      contentArea.innerHTML = `<h2>${page}</h2><p>This section will display the ${page.toLowerCase()} data.</p>`;
    }, 500);
  }

  // Optional: load default page
  loadContent("Dashboard");
});
