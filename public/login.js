// login.js
document.getElementById("login-form").addEventListener("submit", function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (username === "demo" && password === "1234") {
    alert("Giriş başarılı! 🎉");
    window.location.href = "panel.html"; // Giriş sonrası panel sayfasına yönlendirir
  } else {
    alert("Hatalı kullanıcı adı veya şifre!");
  }
});
