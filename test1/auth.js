const puppeteer = require('puppeteer');
require('dotenv').config();

async function getFreshToken() {
    console.log('🤖 [Auth] Uruchamiam robota logującego (wersja z wymuszonym kliknięciem)...');
    
    const browser = await puppeteer.launch({
        headless: true, // "new" bywa problematyczne na starszych wersjach, true jest bezpieczniejsze
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--disable-features=IsolateOrigins,site-per-process' // Pomaga przy iframe'ach
        ]
    });
    
    const page = await browser.newPage();
    
    // Ustawiamy dużą rozdzielczość
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Długie timeouty
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
        await page.goto('https://my.kozminski.edu.pl', { waitUntil: 'domcontentloaded' });
        
        // ===============================================
        // KROK 1: WYMUSZENIE KLIKNIĘCIA "Konto uczelniane"
        // ===============================================
        console.log('👀 [Auth] Szukam BEZWZGLĘDNIE przycisku "Konto uczelniane"...');
        
        // Czekamy na załadowanie się menu/strony
        await new Promise(r => setTimeout(r, 3000));

        // Lista sposobów na znalezienie tego przycisku
        const linkXpaths = [
            "//a[contains(., 'Konto uczelniane')]", // Szukanie po tekście
            "//span[contains(., 'Konto uczelniane')]/..", // Tekst w span, klikamy rodzica
            "//a[contains(@href, 'login')]", // Link zawierający 'login'
            "//div[contains(@class, 'login')]//a" // Link w divie logowania
        ];

        let buttonClicked = false;

        for (const xpath of linkXpaths) {
            try {
                // Sprawdzamy czy element istnieje (krótki timeout dla każdego)
                const elements = await page.$x(xpath);
                if (elements.length > 0) {
                    // Sprawdzamy czy jest widoczny
                    const isVisible = await elements[0].boundingBox();
                    if (isVisible) {
                        console.log(`👆 [Auth] Znaleziono przycisk (metoda: ${xpath}). Klikam!`);
                        
                        // Próbujemy kliknąć na dwa sposoby dla pewności
                        await Promise.all([
                             elements[0].click(),
                             page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
                        ]);
                        
                        buttonClicked = true;
                        break;
                    }
                }
            } catch (e) {}
        }

        if (!buttonClicked) {
            console.error('❌ FATAL: Nie udało się kliknąć "Konto uczelniane". Zrzucam tekst strony, żeby zobaczyć co widzi robot:');
            const bodyText = await page.evaluate(() => document.body.innerText); 
            console.error(bodyText.substring(0, 500).replace(/\n/g, ' '));
            // Jeśli nie kliknęliśmy, to i tak próbujemy iść dalej, może auto-redirect zadziałał
        }

        console.log(`🔗 Adres po próbie kliknięcia: ${page.url()}`);

        // ===============================================
        // KROK 2: LOGOWANIE (Metoda Brute Force + Fix dla braku inputów)
        // ===============================================
        console.log('✍️ [Auth] Szukam pola email...');
        
        // Czekamy aż strona "oszaleje" i załaduje formularze
        await new Promise(r => setTimeout(r, 5000));

        let emailInputFound = null;
        
        // 1. Sprawdzamy standardowe selektory
        const selectors = ['#userNameInput', 'input[type="email"]', 'input[name="UserName"]', '#Input_UserName'];
        for (const sel of selectors) {
            if (await page.$(sel)) {
                console.log(`✅ Znaleziono pole: ${sel}`);
                emailInputFound = sel;
                break;
            }
        }

        // 2. Jeśli nie ma, szukamy inputów głębiej (mogą być w ramkach)
        if (!emailInputFound) {
            console.log('⚠️ Szukam inputów "brute force"...');
            const inputs = await page.$$('input');
            console.log(`ℹ️ Ilość wszystkich inputów na stronie: ${inputs.length}`);
            
            for (const input of inputs) {
                // Sprawdzamy czy input jest widoczny i edytowalny
                const type = await page.evaluate(el => el.type, input);
                const visible = await input.boundingBox();
                
                if (visible && type !== 'hidden' && type !== 'submit') {
                    console.log(`🎲 Wybieram pierwszy widoczny input typu: ${type}`);
                    emailInputFound = input;
                    break;
                }
            }
        }

        if (emailInputFound) {
            if (typeof emailInputFound === 'string') {
                await page.type(emailInputFound, process.env.KOZMINSKI_EMAIL);
            } else {
                await emailInputFound.type(process.env.KOZMINSKI_EMAIL);
            }
            await page.keyboard.press('Enter');
        } else {
            // Ostatnia deska ratunku - pisanie "w powietrze" (działa na stronach w React/Angular)
            console.log('⚠️ Brak pól input! Próbuję pisać email "na ślepo" (czasem to działa)...');
            await page.keyboard.type(process.env.KOZMINSKI_EMAIL);
            await page.keyboard.press('Enter');
        }

        // HASŁO
        console.log('✍️ [Auth] Czekam na pole hasła...');
        await new Promise(r => setTimeout(r, 3000));
        
        // Próba wpisania hasła
        try {
            // Najpierw szukamy dedykowanego pola
            const passInput = await page.$('input[type="password"]');
            if (passInput) {
                await passInput.type(process.env.KOZMINSKI_PASSWORD);
            } else {
                // Jak nie ma, piszemy na ślepo
                await page.keyboard.type(process.env.KOZMINSKI_PASSWORD);
            }
            await page.keyboard.press('Enter');
        } catch (e) {
            console.log('❌ Błąd wpisywania hasła:', e.message);
        }

        // Klikanie Submit/Zaloguj
        try {
            await new Promise(r => setTimeout(r, 2000));
            const submitBtn = await page.$('#submitButton, input[type="submit"], button[type="submit"]');
            if (submitBtn) await submitBtn.click();
        } catch(e) {}

        // "Nie wylogowuj mnie"
        try {
            await new Promise(r => setTimeout(r, 3000));
            const staySignedInBtn = await page.$('input[type="submit"]'); 
            if (staySignedInBtn) {
                console.log('👆 [Auth] Potwierdzam sesję...');
                await staySignedInBtn.click();
                await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
            }
        } catch (e) {}

        console.log('⏳ [Auth] Wymuszam Kalendarz...');
        await new Promise(r => setTimeout(r, 3000)); 

        await page.goto('https://my.kozminski.edu.pl/calendar', { waitUntil: 'domcontentloaded' });

        console.log('⏳ [Auth] Czekam na token...');
        for (let i = 0; i < 40; i++) {
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
        throw new Error('Nie udało się zdobyć tokena');
    }
}

module.exports = { getFreshToken };
