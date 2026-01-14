const puppeteer = require('puppeteer');
require('dotenv').config();

async function getFreshToken() {
    console.log('🤖 [Auth] Uruchamiam robota logującego (w tle)...');
    
    // KONFIGURACJA POD CHMURĘ (Render/Railway/Docker)
    // Dodano '--disable-dev-shm-usage', aby uniknąć błędów pamięci w kontenerach
    const browser = await puppeteer.launch({
        headless: "new", // Nowy, wydajniejszy tryb headless
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // KLUCZOWE dla działania na serwerze!
            '--no-first-run',
            '--no-zygote'
        ]
    });
    
    const page = await browser.newPage();
    
    // Ustawiamy "ludzki" User-Agent. 
    // Bez tego Microsoft może wykryć, że to robot i zablokować logowanie.
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Ustawienie domyślnego czasu oczekiwania na dłuższy (np. 60s), bo chmura może być wolna
    page.setDefaultNavigationTimeout(60000);

    let token = null;

    try {
        // 1. Ustawienie nasłuchiwania na token
        await page.setRequestInterception(true);
        
        page.on('request', request => {
            const headers = request.headers();
            // Szukamy tokena w requestach (głównie schedule z kalendarza)
            if (headers['authorization'] && request.url().includes('schedule')) {
                const authHeader = headers['authorization'];
                if (authHeader.startsWith('Bearer ')) {
                    token = authHeader.replace('Bearer ', '');
                    console.log('✅ [Auth] Złapano świeży token z Kalendarza!');
                }
            }
            request.continue();
        });

        // 2. Wejście na stronę startową
        console.log('⏳ [Auth] Wchodzę na stronę główną...');
        await page.goto('https://my.kozminski.edu.pl', { waitUntil: 'networkidle2' });

        // 3. Kliknięcie "Konto uczelniane" (opcjonalne, czasem od razu jest logowanie)
        try {
            const buttonXPath = "//a[contains(., 'Konto uczelniane')]";
            // Czekamy chwilę na przycisk - krótki timeout, bo może go nie być
            try {
                await page.waitForSelector('xpath/' + buttonXPath, { timeout: 5000 });
                const elements = await page.$$('xpath/' + buttonXPath);
                if (elements.length > 0) {
                    await elements[0].click();
                    console.log('👆 [Auth] Kliknięto "Konto uczelniane"');
                    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
                }
            } catch (e) {
                // Ignorujemy brak przycisku
            }
        } catch (e) {
            console.log('ℹ️ [Auth] Przycisk pominięty (może już jesteśmy na logowaniu).');
        }

        // 4. Logowanie - EMAIL
        console.log('✍️ [Auth] Wpisuję email...');
        await page.waitForSelector('#userNameInput', { timeout: 30000 }); // Dłuższy timeout na serwerze
        await page.type('#userNameInput', process.env.KOZMINSKI_EMAIL);
        await page.keyboard.press('Enter');

        // 5. Logowanie - HASŁO
        console.log('✍️ [Auth] Wpisuję hasło...');
        await page.waitForSelector('#passwordInput', { timeout: 30000 });
        await page.type('#passwordInput', process.env.KOZMINSKI_PASSWORD);
        await page.keyboard.press('Enter');
        
        // Klikamy ewentualny przycisk submit (czasem Enter nie wystarcza)
        try {
            const submitBtn = await page.$('#submitButton');
            if (submitBtn) await submitBtn.click();
        } catch (e) {}

        // 6. "Nie wylogowuj mnie" (Potwierdzenie sesji)
        try {
            // Czekamy chwilę na przetworzenie hasła i pojawienie się okna
            await new Promise(r => setTimeout(r, 3000));
            // Szukamy przycisku "Tak" / "Yes" lub input typu submit
            const staySignedInBtn = await page.$('input[type="submit"]'); 
            if (staySignedInBtn) {
                console.log('👆 [Auth] Potwierdzam sesję...');
                await staySignedInBtn.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
            }
        } catch (e) {}

        console.log('⏳ [Auth] Zalogowano. Przechodzę do Kalendarza...');
        await new Promise(r => setTimeout(r, 3000)); 

        // 7. Wymuszenie wejścia w Kalendarz (To wywołuje request 'schedule')
        // Używamy 'domcontentloaded' zamiast 'networkidle2' dla szybkości, bo zależy nam tylko na wyzwoleniu requestu
        await page.goto('https://my.kozminski.edu.pl/calendar', { waitUntil: 'domcontentloaded' });

        // 8. Czekamy na token
        console.log('⏳ [Auth] Czekam na token...');
        // Czekamy max 20 sekund na złapanie tokena
        for (let i = 0; i < 20; i++) {
            if (token) break;
            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (error) {
        console.error('❌ [Auth] Błąd:', error.message);
        // Opcjonalnie: zrób zrzut ekranu błędu, jeśli debugujesz
        // await page.screenshot({ path: 'error.png' });
    } finally {
        // ZAWSZE zamykamy przeglądarkę, żeby nie zapychać pamięci RAM serwera
        if (browser) await browser.close();
    }

    if (token) {
        return token;
    } else {
        throw new Error('Nie udało się zdobyć tokena (tryb ukryty)');
    }
}

module.exports = { getFreshToken };