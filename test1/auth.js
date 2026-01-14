const puppeteer = require('puppeteer');
require('dotenv').config();

async function getFreshToken() {
    console.log('🤖 [Auth] Uruchamiam robota logującego (w tle)...');
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote'
        ]
    });
    
    const page = await browser.newPage();
    
    // Ustawiamy User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Wydłużamy domyślny czas na wszystko do 2 minut (bo serwer jest wolny)
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    let token = null;

    try {
        // 1. Nasłuchiwanie tokena
        await page.setRequestInterception(true);
        page.on('request', request => {
            const headers = request.headers();
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
        console.log(`🔗 Jesteśmy na: ${page.url()}`);

        // 3. Kliknięcie "Konto uczelniane"
        // ZWIĘKSZONO TIMEOUT: Czekamy 30s zamiast 5s, bo strona może się wolno ładować
        try {
            const buttonXPath = "//a[contains(., 'Konto uczelniane')]";
            console.log('👀 Szukam przycisku "Konto uczelniane"...');
            await page.waitForSelector('xpath/' + buttonXPath, { timeout: 30000 }); 
            const elements = await page.$$('xpath/' + buttonXPath);
            if (elements.length > 0) {
                await elements[0].click();
                console.log('👆 [Auth] Kliknięto "Konto uczelniane"');
                // Czekamy na nawigację po kliknięciu
                await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => console.log('⚠️ Nawigacja po kliknięciu trwała zbyt długo'));
            }
        } catch (e) {
            console.log('ℹ️ [Auth] Nie znaleziono przycisku "Konto uczelniane" (może już jesteśmy na logowaniu?)');
        }

        console.log(`🔗 Aktualny adres przed logowaniem: ${page.url()}`);

        // 4. Logowanie - EMAIL
        console.log('✍️ [Auth] Szukam pola email...');
        // Tutaj robot wcześniej ginął. Teraz poczeka do 2 minut i w razie błędu pokaże URL
        await page.waitForSelector('#userNameInput'); 
        await page.type('#userNameInput', process.env.KOZMINSKI_EMAIL);
        await page.keyboard.press('Enter');

        // 5. Logowanie - HASŁO
        console.log('✍️ [Auth] Wpisuję hasło...');
        await page.waitForSelector('#passwordInput');
        await new Promise(r => setTimeout(r, 2000)); // Mała pauza dla stabilności
        await page.type('#passwordInput', process.env.KOZMINSKI_PASSWORD);
        await page.keyboard.press('Enter');
        
        try {
            const submitBtn = await page.$('#submitButton');
            if (submitBtn) await submitBtn.click();
        } catch (e) {}

        // 6. Potwierdzenie sesji
        try {
            await new Promise(r => setTimeout(r, 5000)); // Dłuższa pauza na przetworzenie logowania
            const staySignedInBtn = await page.$('input[type="submit"]'); 
            if (staySignedInBtn) {
                console.log('👆 [Auth] Potwierdzam sesję...');
                await staySignedInBtn.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
            }
        } catch (e) {}

        console.log('⏳ [Auth] Zalogowano? Przechodzę do Kalendarza...');
        await new Promise(r => setTimeout(r, 5000)); 

        // 7. Wymuszenie wejścia w Kalendarz
        await page.goto('https://my.kozminski.edu.pl/calendar', { waitUntil: 'domcontentloaded' });

        // 8. Czekamy na token
        console.log('⏳ [Auth] Czekam na token...');
        for (let i = 0; i < 40; i++) { // Czekamy dłużej (40s)
            if (token) break;
            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (error) {
        console.error('❌ [Auth] Błąd krytyczny:', error.message);
        console.error('🔗 Strona błędu:', page.url()); // To nam powie gdzie dokładnie wywaliło
    } finally {
        if (browser) await browser.close();
    }

    if (token) {
        return token;
    } else {
        throw new Error('Nie udało się zdobyć tokena (tryb ukryty)');
    }
}

module.exports = { getFreshToken };
