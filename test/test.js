const fs = require('fs');
var webdriver = require('selenium-webdriver'),
    By = webdriver.By,
    until = webdriver.until;
var chromedriver = require('chromedriver');
var chromeCapabilities = webdriver.Capabilities.chrome();

var chromeOptions = {
    'args': ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--window-size=1280,800','--start-maximized']
};
chromeCapabilities.set('chromeOptions', chromeOptions);
chromeCapabilities.set('acceptSslCerts',true);
chromeCapabilities.set('acceptInsecureCerts',true);
var driver1;
var driver2;


// describe('small test', function(){

//     it('tiny test case', done => {
//         console.log('waiting 3 seconds');
//         setTimeout(function(){
//             console.log('waiting over.');
//             done();
//         }, 2000);

//     }).timeout(3000);

//  });

    describe('testing ',function(){
        beforeEach(function(){
            this.timeout(600);
            driver1 = new webdriver.Builder().withCapabilities(chromeCapabilities).forBrowser('chrome').build();
            driver2 = new webdriver.Builder().withCapabilities(chromeCapabilities).forBrowser('chrome').build();
            driver1.get('http://localhost:8443/');
            driver2.get('http://localhost:8443/');
        });

        afterEach(function(){

        });
        it('all',async function(){
            var user = 'tuan';
            var sPeer = 'anh';
            let user1 = driver1.wait(until.elementLocated(By.id('name')),10000);
            user1.sendKeys(user);

            let user2 = driver2.wait(until.elementLocated(By.id('name')),10000);
            user2.sendKeys(sPeer);
            // await driver1.findElement(By.id('name')).sendKeys('tuan');
            // await driver2.findElement(By.id('name')).sendKeys('dao');
            let button1 = await driver1.wait(until.elementLocated(By.id('register'),5000));
            await button1.click();
            let button2 = await driver2.wait(until.elementLocated(By.id('register'),5000));
            await button2.click();
            let peer = await driver1.wait(until.elementLocated(By.id('peer')),5000);
            await peer.sendKeys(sPeer);
            let call1 = await driver1.wait(until.elementLocated(By.id('call')),5000);
            await call1.click();
            // await driver2.wait(until.alertIsPresent(),1000);
            // await driver1.sleep(60*1000);
            // let stop1 = driver1.findElement(By.id('terminate'));
            // driver1.wait(until.elementIsEnabled(stop1,60*1000,'element is still disabled'))
            // .then(function(status) {
            //     // setTimeout(function(){
            //     // },60*1000);
            //     console.log(status);
            // }).catch(err => done(err));
            while(true){
                let stop1 =  driver1.wait(until.elementLocated(By.id('terminate')),5000);
                // let stop2 = await driver1.wait(until.elementLocated(By.id('terminate')),5000);
                var opacity= await stop1.getCssValue('opacity');
                if(opacity == 1){
                    break;
                }    
                // if(opacity == 1) break;
            }
        }).timeout(30*1000);

    });


    // (async function example() {
    //     for(i=0; i<=0; i+=2){

    //         let driver1 = await new webdriver.Builder().withCapabilities(chromeCapabilities).forBrowser('chrome').build();
    //         let driver2 = await new webdriver.Builder().withCapabilities(chromeCapabilities).forBrowser('chrome').build();
    //     try {
    //         console.log(i);
    //         var user = i.toString();
    //         var sPeer = (i+1).toString();
    //         driver1.get('http://localhost:8443/');
    //         driver2.get('http://localhost:8443/');
    //         let user1 = driver1.wait(until.elementLocated(By.id('name')),10000);
    //         user1.sendKeys(user);

    //         let user2 = driver2.wait(until.elementLocated(By.id('name')),10000);
    //         user2.sendKeys(sPeer);
    //         // await driver1.findElement(By.id('name')).sendKeys('tuan');
    //         // await driver2.findElement(By.id('name')).sendKeys('dao');
    //         let button1 = await driver1.wait(until.elementLocated(By.id('register'),5000));
    //         await button1.click();
    //         let button2 = await driver2.wait(until.elementLocated(By.id('register'),5000));
    //         await button2.click();
    //         let peer = await driver1.wait(until.elementLocated(By.id('peer')),5000);
    //         await peer.sendKeys(sPeer);
    //         let call1 = await driver1.wait(until.elementLocated(By.id('call')),5000);
    //         call1.click();
    //         // await driver2.wait(until.alertIsPresent(),1000);
    //         // await driver1.sleep(60*1000);
    //         let stop1 = driver1.findElement(By.id('terminate'));
    //         driver1.wait(until.elementIsEnabled(stop1,60*1000,'element is still disabled')).then(function(){
    //             setTimeout(function(){
    //                stop1.click();
    //             },60*1000);
    //         });
            // driver1.findElement(By.id('terminate')).getAttribute('disabled')
            // .then(function(status) {
            //     console.log(status);
            // })
            // let stop1 = await driver1.w  ait(until.elementLocated(By.id('terminate')),5000);
            // let stop2 = await driver1.wait(until.elementLocated(By.id('terminate')),5000);
            // if (stop1.isDisplayed()) {
            //     console.log('haha');
            // }else {
            //     console.log('hihi');
            // }
            // setTimeout(function(){
                // driver1.takeScreenshot().then(async function(base64png){
                //       fs.writeFileSync(user +'.jpeg', new Buffer(base64png, 'base64'));
                //     });
//             // },5000);
//         } finally {
        

//             // driver1.takeScreenshot().then(function(base64png){
//             //     fs.writeFileSync(user +'.jpeg', new Buffer(base64png, 'base64'));
//             // });            
            
//             setTimeout(function(){
//                 driver1.quit();
//                 driver2.quit();
//             },180000)
//         }
//     }
// })();

// driver1.get('https://localhost:8443/')
//         .then(_ =>{
//             driver2.get('https://localhost:8443/')
//             .then(async function(_) {
//                 await driver1.findElement(By.name('name')).sendKeys('tuan');
                // await driver2.findElement(By.name('name')).sendKeys('anh');
//             })
//             .then(async function(_){
                // let button1 = await driver1.wait(until.elementLocated(By.id('register'),5000));
                // await button1.click();
                // let button2 = await driver2.wait(until.elementLocated(By.id('register'),5000));
                // await button2.click();
//             }).then(async function(_) {
                // let peer = await driver1.wait(until.elementLocated(By.name('peer')),5000).sendKeys('anh');
                // let call1 = await driver1.wait(until.elementLocated(By.id('call')),5000);
                // await call1.click();

                // await driver2.wait(until.alertIsPresent(),1000);
                // driver2.switchTo().alert().accept().catch(e => console.log('caught: ' +e));
//             })
//         })
        // .then(async function(_){
        //     await driver1.findElement(By.name('name')).sendKeys('tuan');
        //     await driver2.findElement(By.name('name')).sendKeys('anh');
        // })
        // .then(async function(_){
        //     let button1 = await driver1.wait(until.elementLocated(By.id('register'),5000));
        //     await button1.click();
        //     let button2 = await driver2.wait(until.elementLocated(By.id('register'),5000));
        //     await button2.click();
        // })
        // .catch(err => console.log(err));
        // driver1.sleep(50000);
        // driver2.sleep(50000);
        // driver1.quit();
        // driver2.quit();

