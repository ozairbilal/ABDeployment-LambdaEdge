'use strict';

// Origin Request
const sourceCoookie = 'X-Source';
const sourceMain = 'Your Source';
const sourceExperiment = 'Experimental Source';
const experimentBucketName = 'Your-DNS.com';
const mainELBURL="ELB"
const experimentBucketRegion = 'eu-west-1';

var old_website_links = [
    '/robots.txt',
    '/robots',
    '/assets'
    ]
// Origin Request handler
exports.handler = (event, context, callback) => {
    // ,
    // '/styles',
    // '/manifest',
    // '/api',
    // '/styles.f37168dbd7f7acb2823e.css'
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    console.log("HEADERS: ", headers);
    function is_asset(uri){
        if (uri.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|otf|ttf|svg|eot|woff|woff2|css|js)$/)) 
        {console.log("in asset", uri);
            return true;}
        else return false;
    }
    function matchesSubstring(values) {
        if (values != undefined && values instanceof Array)
            return old_website_links.some(s => values[0].value.includes(s));
        else if (values != undefined && values instanceof String)
            return old_website_links.some(s => values.includes(s));
        else 
            return false;
        
    }
    
    const source = decideSource(headers);
    if(  old_website_links.includes(request.uri) || matchesSubstring(request.uri)  || ((matchesSubstring(headers.referer)) && is_asset (request.uri))){
        console.log("Constant Pages");
        callback(null, request);
        return;
    }
    // If Source is Experiment, change Origin and Host header
    else if ( source === sourceExperiment ) {
        
            console.log('Setting Origin to experiment bucket');
            request.origin = {
            custom: {
                domainName: experimentBucketName,
                port: 443,
                protocol: 'https',
                readTimeout: 20,
                keepaliveTimeout: 5,
                customHeaders: {},
                sslProtocols: ['TLSv1', 'TLSv1.1'],
                path: ''
            }
        };

        // Also set Host header to prevent “The request signature we calculated does not match the signature you provided” error
        // headers['host'] = [{key: 'host', value: experimentBucketName }];
         headers['host'] = [{key: 'host', value: experimentBucketName }];
    }
    // No need to change anything if Source was Main or undefined
    
    callback(null, request);
};


// Decide source based on source cookie.
const decideSource = function(headers) {
    const sourceMainCookie = `${sourceCoookie}=${sourceMain}`;
    const sourceExperimenCookie = `${sourceCoookie}=${sourceExperiment}`;
    
    // Remember a single cookie header entry may contains multiple cookies
     
    if (headers.cookie) {
        // ...ugly but simple enough for now
        
        for (let i = 0; i < headers.cookie.length; i++) { 
            if (headers.cookie[i].value.indexOf(sourceExperimenCookie) >= 0) {
                console.log('Experiment Source cookie found');
                return sourceExperiment;
            }
            if (headers.cookie[i].value.indexOf(sourceMainCookie) >= 0) {
                console.log('Main Source cookie found');
                return sourceMain;
            }            
        }
    }
    console.log('No Source cookie found (Origin undecided)');
}
