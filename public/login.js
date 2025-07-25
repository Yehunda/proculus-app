document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if (username === "demo" && password === "1234") {
      window.location.href = "panel.html"; // Yönlendirme
    } else {
      alert("Invalid credentials. Please try again.");
    }
  });
});
