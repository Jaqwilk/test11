const puppeteer = require('puppeteer');
require('dotenv').config();

async function getFreshToken() {
    console.log('🤖 [Auth] Uruchamiam robota (Wersja dopasowana do screena)...');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote'
        ]
    });
    
    const page = await browser.newPage();
    
    // Ustawiamy ekran 1920x1080, żeby widział przyciski jak na Twoim screenie
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    let token = null;

    try {
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

        // 1. Wchodzimy BEZPOŚREDNIO na adres ze screena
        const loginUrl = 'https://login.kozminski.edu.pl/Account/Login';
        console.log(`⏳ [Auth] Wchodzę bezpośrednio na: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        
        // 2. KLIKANIE PRZYCISKU ZE SCREENA ("Konto uczelniane")
        console.log('👀 [Auth] Szukam przycisku "Konto uczelniane" na ekranie logowania...');
        
        try {
            // Szukamy przycisku po tekście (tak jak wygląda na obrazku)
            const buttonXPath = "//button[contains(., 'Konto uczelniane')] | //a[contains(., 'Konto uczelniane')]";
            await page.waitForSelector('xpath/' + buttonXPath, { timeout: 10000 });
            
            const buttons = await page.$$('xpath/' + buttonXPath);
            if (buttons.length > 0) {
                console.log('👆 [Auth] Widzę przycisk ze screena! Klikam go...');
                await buttons[0].click();
                // Czekamy na przeładowanie (prawdopodobnie do formularza Microsoft lub rozwinie się input)
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (e) {
            console.log('ℹ️ [Auth] Nie musiałem klikać przycisku (może od razu widać formularz).');
        }

        // 3. LOGOWANIE (Email -> Hasło)
        console.log('✍️ [Auth] Szukam pola email...');
        
        // Szukamy inputa - po kliknięciu przycisku powinien się pojawić
        let emailInput = null;
        try {
            // Najpierw czekamy chwilę na pojawienie się inputa
            await page.waitForSelector('input[type="email"], input[name="UserName"], #userNameInput', { timeout: 15000 });
            
            // Szukamy właściwego pola
            const selectors = ['#userNameInput', 'input[type="email"]', 'input[name="UserName"]'];
            for (const sel of selectors) {
                if (await page.$(sel)) {
                    emailInput = sel;
                    break;
                }
            }
        } catch (e) {
            console.log('⚠️ Nie widzę standardowego pola email. Próbuję pisać w pierwszy widoczny input...');
            const inputs = await page.$$('input:not([type="hidden"])');
            if (inputs.length > 0) emailInput = inputs[0];
        }

        if (emailInput) {
            console.log('✍️ Wpisuję email...');
            if (typeof emailInput === 'string') await page.type(emailInput, process.env.KOZMINSKI_EMAIL);
            else await emailInput.type(process.env.KOZMINSKI_EMAIL);
            await page.keyboard.press('Enter');
        } else {
            throw new Error('Nie udało się znaleźć pola do wpisania maila');
        }

        // HASŁO
        await new Promise(r => setTimeout(r, 2000));
        console.log('✍️ [Auth] Wpisuję hasło...');
        await page.type('input[type="password"]', process.env.KOZMINSKI_PASSWORD);
        await page.keyboard.press('Enter');

        // Submit (dla pewności)
        try {
            await new Promise(r => setTimeout(r, 1000));
            const submitBtn = await page.$('#submitButton, button[type="submit"]');
            if (submitBtn) await submitBtn.click();
        } catch (e) {}

        // Potwierdzenie sesji "Tak"
        try {
            await new Promise(r => setTimeout(r, 3000));
            const stayBtn = await page.$('input[value="Tak"], input[type="submit"]');
            if (stayBtn) {
                console.log('👆 [Auth] Potwierdzam sesję...');
                await stayBtn.click();
                await page.waitForNavigation().catch(() => {});
            }
        } catch (e) {}

        console.log('⏳ [Auth] Logowanie zakończone. Przechodzę do Kalendarza po token...');
        await new Promise(r => setTimeout(r, 3000));
        await page.goto('https://my.kozminski.edu.pl/calendar', { waitUntil: 'domcontentloaded' });

        for (let i = 0; i < 40; i++) {
            if (token) break;
            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (error) {
        console.error('❌ [Auth] Błąd:', error.message);
        console.error('🔗 URL błędu:', page.url());
        const body = await page.evaluate(() => document.body.innerText);
        console.error('📄 Tekst strony błędu:', body.substring(0, 200).replace(/\n/g, ' '));
    } finally {
        if (browser) await browser.close();
    }

    if (token) return token;
    else throw new Error('Nie udało się zdobyć tokena');
}

module.exports = { getFreshToken };
