const express = require('express');
const axios = require('axios');
const cors = require('cors');
// Importujemy Twojego robota logującego (plik auth.js musi być w tym samym folderze!)
const { getFreshToken } = require('./auth'); 

const app = express();
app.use(cors());
app.use(express.static('public'));

// ==========================================
// 1. AUTOMATYZACJA MYKOZMINSKI (Puppeteer)
// ==========================================

// Tu przechowujemy aktualny token (zmienia się co ~45 min)
let CURRENT_KOZMINSKI_TOKEN = null;

// Funkcja odświeżająca token
async function refreshUniversityToken() {
    try {
        console.log('🔄 [Server] Rozpoczynam automatyczne odświeżanie tokena uczelni...');
        const newToken = await getFreshToken(); // Uruchamia Puppeteera
        
        if (newToken) {
            CURRENT_KOZMINSKI_TOKEN = newToken;
            console.log('✅ [Server] Token zaktualizowany pomyślnie! Ważny przez ok. 1h.');
        }
    } catch (error) {
        console.error('❌ [Server] Nie udało się odświeżyć tokena:', error.message);
        // Jeśli to pierwsze uruchomienie i nie mamy tokena, spróbujemy znowu za minutę
        if (!CURRENT_KOZMINSKI_TOKEN) {
            console.log('⚠️ [Server] Spróbuję ponownie za 60 sekund...');
            setTimeout(refreshUniversityToken, 60000);
        }
    }
}

// Uruchamiamy pobieranie tokena OD RAZU przy starcie serwera
refreshUniversityToken();

// Ustawiamy "budzik", żeby odświeżał token co 45 minut (żeby nigdy nie wygasł)
// 45 min * 60 sek * 1000 ms = 2700000 ms
setInterval(refreshUniversityToken, 45 * 60 * 1000);


// ==========================================
// 2. ENDPOINT PLANU ZAJĘĆ
// ==========================================
app.get('/api/university/schedule', async (req, res) => {
    // Sprawdzamy, czy robot już zdobył token
    if (!CURRENT_KOZMINSKI_TOKEN) {
        return res.status(503).json({ error: "Serwer jeszcze się loguje... Odśwież za chwilę." });
    }

    console.log('🏫 Pobieram plan używając automatycznego tokena...');
    
    try {
        const response = await axios.get('https://backend-ptuhdkyrf7cws.azurewebsites.net/api/calendar/student/schedule', {
            headers: {
                'Authorization': `Bearer ${CURRENT_KOZMINSKI_TOKEN}`,
                // Udajemy przeglądarkę, żeby Azure nas wpuścił
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
                'Origin': 'https://my.kozminski.edu.pl',
                'Referer': 'https://my.kozminski.edu.pl/',
                'Accept': 'application/json, text/plain, */*'
            },
            timeout: 15000 // 15 sekund timeoutu
        });

        // Wysyłamy plan do Twojej strony
        res.json(response.data);

    } catch (error) {
        console.error('❌ Błąd pobierania planu:', error.message);
        
        // Jeśli uczelnia odrzuciła token (401), wymuszamy natychmiastowe odświeżenie
        if (error.response && error.response.status === 401) {
            console.log('⚠️ Token wygasł przed czasem! Wymuszam odświeżenie...');
            refreshUniversityToken();
        }
        
        res.status(500).json({ error: "Nie udało się pobrać planu." });
    }
});


// ==========================================
// 3. INTEGRACJA HEVY / STRAVA (Twoja konfiguracja)
// ==========================================
const STRAVA_CLIENT_ID = '195716'; 
const STRAVA_CLIENT_SECRET = 'f6b9c62edd23672700f6b84edb3a903132063500';
const STRAVA_REFRESH_TOKEN = '9968e7e8febd9b5989c6561d358d831aa1b4d96d'; 

async function getStravaToken() {
    try {
        const res = await axios.post('https://www.strava.com/oauth/token', {
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            refresh_token: STRAVA_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        });
        return res.data.access_token;
    } catch (e) { 
        console.error("Błąd Stravy:", e.message);
        return null; 
    }
}

app.get('/api/workouts', async (req, res) => {
    try {
        const token = await getStravaToken();
        if (!token) return res.json([]); // Zwracamy pustą listę jak błąd, żeby nie wywalić strony
        
        // Pobieramy ostatnie 3 aktywności
        const listResponse = await axios.get('https://www.strava.com/api/v3/athlete/activities?per_page=3', {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Pobieramy szczegóły każdej aktywności (żeby mieć opis ćwiczeń)
        const detailedWorkouts = await Promise.all(listResponse.data.map(async (activity) => {
            try {
                const detailResponse = await axios.get(`https://www.strava.com/api/v3/activities/${activity.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                return detailResponse.data;
            } catch (e) { return activity; }
        }));

        // Formatujemy dane dla frontendu
        const cleanData = detailedWorkouts.map(w => ({
            userName: "Natan Smogór",
            activityName: w.name,
            fullDate: new Date(w.start_date_local).toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
            description: w.description || "",
            duration: w.moving_time + 's',
            source: "Logged with Hevy"
        }));

        res.json(cleanData);
    } catch (e) { 
        console.error("Błąd API Stravy");
        res.status(500).json({error: "Strava Error"}); 
    }
});

// Startujemy serwer
app.listen(3000, () => console.log('🚀 Serwer gotowy na http://localhost:3000'));