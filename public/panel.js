document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".menu-item");
  const content = document.getElementById("content-panel");

  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      // Aktif sınıfı güncelle
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      // İçeriği güncelle
      const section = item.getAttribute("data-section");
      content.innerHTML = `<h2>${section}</h2><p>Welcome to the ${section} section of Proculus.</p>`;
    });
  });
});
