// PLIK: setup.js
const axios = require('axios');

// Twoje dane (UZUPEŁNIONE)
const clientId = '195716';
const clientSecret = 'f6b9c62edd23672700f6b84edb3a903132063500';
const authCode = '9198c1867d26a393f38657947b9ca7d0ad0d2d6c'; // Twój nowy kod

async function getToken() {
  try {
    console.log('⏳ Wymieniam kod na token...');
    const res = await axios.post('https://www.strava.com/oauth/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code: authCode,
      grant_type: 'authorization_code'
    });
    console.log('\n✅ SUKCES! Twój Refresh Token to:');
    console.log('------------------------------------------------');
    console.log(res.data.refresh_token);
    console.log('------------------------------------------------');
    console.log('👉 Skopiuj ten ciąg znaków i wklej go do pliku server.js');
  } catch (e) {
    console.log('❌ Błąd! Kod wygasł lub jest błędny. Wygeneruj link jeszcze raz.');
    console.log(e.response?.data);
  }
}
getToken();
