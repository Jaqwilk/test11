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
    
    // 1. ZMIANA: Ustawiamy duży ekran, żeby wymusić widok desktopowy
    // To często naprawia problem znikających elementów na serwerach
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Długie timeouty dla wolnego serwera
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

        console.log('⏳ [Auth] Wchodzę na stronę główną...');
        await page.goto('https://my.kozminski.edu.pl', { waitUntil: 'networkidle2' });
        console.log(`🔗 Jesteśmy na: ${page.url()}`);

        // Próba kliknięcia przycisku (opcjonalna)
        try {
            const buttonXPath = "//a[contains(., 'Konto uczelniane')]";
            // Krótki czas na szukanie przycisku, żeby nie tracić czasu
            await page.waitForSelector('xpath/' + buttonXPath, { timeout: 10000 }); 
            const elements = await page.$$('xpath/' + buttonXPath);
            if (elements.length > 0) {
                await elements[0].click();
                console.log('👆 [Auth] Kliknięto "Konto uczelniane"');
                await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
            }
        } catch (e) {
            console.log('ℹ️ [Auth] Przycisk pominięty - zakładam, że jesteśmy na loginie.');
        }

        console.log(`🔗 Adres logowania: ${page.url()}`);

        // 2. ZMIANA: Szukamy pola loginu na wiele sposobów (ID, Name, Type)
        // To jest "pancerne" rozwiązanie - zadziała nawet jak zmienią ID elementu
        const loginSelectors = [
            '#userNameInput',       // Twoje oryginalne ID
            'input[name="UserName"]', // Standard ASP.NET
            'input[type="email"]',    // Standard HTML
            'input[name="loginfmt"]'  // Standard Microsoft
        ];
        
        console.log('✍️ [Auth] Szukam pola email...');
        let emailInput = null;
        
        // Pętla sprawdzająca każdy selektor
        for (const selector of loginSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                emailInput = selector;
                console.log(`✅ Znaleziono pole logowania: ${selector}`);
                break; // Mamy to! Wychodzimy z pętli
            } catch (e) {}
        }

        if (!emailInput) {
            // DIAGNOSTYKA: Jeśli nadal nic nie widzi, zrzucamy kawałek HTML do logów
            const html = await page.content();
            console.error('❌ FATAL: Nie widzę pola logowania. Oto fragment strony (pierwsze 500 znaków):');
            console.error(html.substring(0, 500));
            throw new Error('Nie znaleziono żadnego pola pasującego do loginu');
        }

        // Wpisujemy email do znalezionego pola
        await page.type(emailInput, process.env.KOZMINSKI_EMAIL);
        await page.keyboard.press('Enter');

        // HASŁO - podobna strategia, ale tu zazwyczaj #passwordInput działa
        console.log('✍️ [Auth] Wpisuję hasło...');
        const passwordSelectors = ['#passwordInput', 'input[type="password"]'];
        let passwordInput = null;
        
        for (const selector of passwordSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                passwordInput = selector;
                break;
            } catch (e) {}
        }
        
        if (passwordInput) {
            await new Promise(r => setTimeout(r, 1000));
            await page.type(passwordInput, process.env.KOZMINSKI_PASSWORD);
            await page.keyboard.press('Enter');
        } else {
             // Próbujemy pisać "w ciemno" jeśli nie znalazł pola, czasem to działa
             await page.keyboard.type(process.env.KOZMINSKI_PASSWORD);
             await page.keyboard.press('Enter');
        }
        
        // Klikanie Submit
        try {
            const submitBtn = await page.$('#submitButton, input[type="submit"]');
            if (submitBtn) await submitBtn.click();
        } catch (e) {}

        // Potwierdzenie sesji "Tak / Nie"
        try {
            await new Promise(r => setTimeout(r, 3000));
            const staySignedInBtn = await page.$('input[type="submit"][value="Tak"], input[type="submit"]'); 
            if (staySignedInBtn) {
                console.log('👆 [Auth] Potwierdzam sesję...');
                await staySignedInBtn.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
            }
        } catch (e) {}

        console.log('⏳ [Auth] Logowanie zakończone. Wymuszam Kalendarz...');
        await new Promise(r => setTimeout(r, 3000)); 

        await page.goto('https://my.kozminski.edu.pl/calendar', { waitUntil: 'domcontentloaded' });

        console.log('⏳ [Auth] Czekam na token...');
        for (let i = 0; i < 30; i++) {
            if (token) break;
            await new Promise(r => setTimeout(r, 1000));
        }

    } catch (error) {
        console.error('❌ [Auth] Błąd:', error.message);
        console.error('🔗 Adres błędu:', page.url());
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
