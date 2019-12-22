let request = require('request');
let fs = require('fs')
let slugify = require('slugify')
let marked = require('marked')
let schedule = require('node-schedule');
const geolib = require('geolib');

const express = require('express')
const app = express()
const port = 1337

const productsAPIEndpoint = "https://api-extern.systembolaget.se/product/v1/product";
const storesAPIEndpoint = "https://api-extern.systembolaget.se/site/v1/site";
const productsWithStoreAPIEndpoint = "https://api-extern.systembolaget.se/product/v1/product/getproductswithstore";

let secret = require('./secret');

let APIHeaders = {
  "Ocp-Apim-Subscription-Key" : secret.Ocp_Apim_Subscription_Key
 };

let lastParseDate = new Date()
let startedParseDate = new Date()

// Used to contain stores individual products
let stores = [];

// Stores without its products/productId (Used to decide closest store baset on GPS)
let storesSlim = [];

let categoryList = {
  "red_wine": new Array(),
  "cider_and_mixed_drink": new Array(),
  "white_wine": new Array(),
  "spirits": new Array(),
  "sparkling_wine": new Array(),
  "beer": new Array(),
  "rose_wine": new Array(),
  "gifts": new Array(),
  "aperitif_and_dessert": new Array(),
  "alcohol_free": new Array(),

  "wine": new Array(), // Added as extra!
  "all": new Array(), // Added as extra!
  "all_sa": new Array(), // Added as extra!

  // Filteret out standard assortment (BS)
  "red_wine_sa": new Array(), // Added as extra! - Standard assortment
  "cider_and_mixed_drink_sa": new Array(), // Added as extra! - Standard assortment
  "white_wine_sa": new Array(), // Added as extra! - Standard assortment
  "spirits_sa": new Array(), // Added as extra! - Standard assortment
  "sparkling_wine_sa": new Array(), // Added as extra! - Standard assortment
  "beer_sa": new Array(), // Added as extra! - Standard assortment
  "rose_wine_sa": new Array(), // Added as extra! - Standard assortment
  "gifts_sa": new Array(), // Added as extra! - Standard assortment
  "aperitif_and_dessert_sa": new Array(), // Added as extra! - Standard assortment
  "alcohol_free_sa": new Array(), // Added as extra! - Standard assortment
  "wine_sa": new Array()  // Added as extra! - Standard assortment
}

function getEnglishCategoryName(swedishName){

  if(swedishName == null){
    return "undefined";
  }

  switch(swedishName.replaceAll("\"","")) {
    case "Röda viner":
      return "red_wine";
    case "Cider och blanddrycker":
      return "cider_and_mixed_drink";
    case "Vita viner":
      return "white_wine";
    case "Sprit":
      return "spirits";
    case "Mousserande viner":
      return "sparkling_wine";
    case "Öl":
      return "beer";
    case "Roséviner":
      return "rose_wine";
    case "Presentartiklar":
      return "gifts";
    case "Aperitif & dessert":
      return "aperitif_and_dessert"
    case "Alkoholfritt":
      return "alcohol_free"
    default:
      console.log("Found new category: " + swedishName)
  }

}

// Parse downloaded productList to category arrays
function createCategoryLists(productList){

  resetProductArrays()

  var allWines = [];

  for (var i = 0; i < productList.length; i++) {

    let currentCategory = JSON.stringify(productList[i]["Category"]).replaceAll("\"","");

    if(categoryList[currentCategory] === undefined){
      // If category == null they are weird
      //console.log("Found currentCategory=null!")
    }else{
      categoryList["all"].push(productList[i])
      categoryList[currentCategory].push(productList[i])

      if(currentCategory == "red_wine" || currentCategory == "sparkling_wine" || currentCategory == "white_wine" || currentCategory == "rose_wine"){
        allWines.push(productList[i])

        // filling viner_sa
        if(productList[i].Assortment == "FS"){
          categoryList["wine_sa"].push(productList[i])
        }
      }

      // Standard assortment --> Add to *_sa
      if(productList[i].Assortment == "FS"){
        let standardAssortmentName = currentCategory + "_sa"
        categoryList[standardAssortmentName].push(productList[i])
        categoryList["all_sa"].push(productList[i])
      }

    }
  }

  allWines.sort(function(a, b) {
    return parseFloat(b.APK) - parseFloat(a.APK);
  });

  categoryList["wine"] = allWines;
}


// TODO to be implemented
function checkIfURLWorks(product){

  let url = JSON.stringify(product.URL)
  
  if(url != undefined){

    //console.log("the url is " + url.slice(1,url.length-1))

    url = url.replaceAll("\"","");

    console.log("url is : " + url)

    request({ url: url}, function (error, response, body) {

      //console.log("product: " + JSON.stringify(product))

      if(response != undefined){
        console.log("response: " + response);
      }else{
        //console.log("response == undefined")
      }
      
    })

  }else{
    console.log("Product's url is undefined : " + JSON.stringify(product))
    return false;
  }
  
}

// Create and set .URL attribute in article JSON-objects
// URL leads to the articles www.systembolaget.se/... page
function addURLtoProduct(product){
  let baseURL = "https:\//www.systembolaget.se/dryck";
  let categoryURL = "";
  let nameURL = "";
  let numberURL = product.ProductNumber;

  if(product.Category == "undefined"){
    return;
  }

  // Get category-url-text
  switch(product.Category) {
  case "red_wine":
    categoryURL = "roda-viner"
    break;
  case "cider_and_mixed_drink":
    categoryURL = "cider-och-blanddrycker"
    break;
  case "white_wine":
    categoryURL = "vita-viner"
    break;
  case "spirits":
    categoryURL = "sprit";
    break;
  case "sparkling_wine":
    categoryURL = "mousserande-viner";
    break;
  case "beer":
    categoryURL = "ol";
    break;
  case "rose_wine":
    categoryURL = "roseviner";
    break;
  case "gifts":
    categoryURL = "presentartiklar"
    break;
  case "aperitif_and_dessert":
    categoryURL = "aperitif-dessert"
    break;
  case "alcohol_free":
    categoryURL = "alkoholfritt"
    break;
  default:
    console.log("Creating URLs")
    console.log("Found new category: " + product.Category)
}

  // Get name-url-text
  nameURL = product.ProductNameBold.toString().toLowerCase();
  nameURL = nameURL.replaceAll("\'","")
  nameURL = nameURL.replaceAll(":","")
  nameURL = nameURL.replaceAll("!","")
  nameURL = nameURL.replaceAll("*","")
  nameURL = nameURL.replaceAll("--","-")
  nameURL = slugify(nameURL);
  nameURL = nameURL.replaceAll("-and-","-")

  let createdURL = baseURL+"/"+categoryURL+"/"+nameURL+"-"+numberURL;
  product.URL = createdURL;
  return createdURL;
}

function translateSwedishCategories(product){
  product.Category = getEnglishCategoryName(product.Category);
}

// Add APK + URL to list of article objects
function processParsedProducts(productList){
  let count = 0;

  // Find max APK to calculate APKScore
  let maxAPKFound = 0;

  for (let i = 0; i < productList.length; i++) {

    // Removing products that is "IsCompletelyOutOfStock = true"
    if(productList[i].IsCompletelyOutOfStock){
      //productList.splice(i,1);
      //console.log("Removed a IsCompletelyOutOfStock=true")
    }

    translateSwedishCategories(productList[i])

    addURLtoProduct(productList[i])

    // Check if URL works
    //checkIfURLWorks(productList[i])

    addAPKtoProduct(productList[i])

    // Max APK to calculate APKScore
    if(productList[i].APK > maxAPKFound){
      maxAPKFound = productList[i].APK
    }
  }

  // Setting APKScore
  for (let i = 0; i < productList.length; i++) {
    productList[i].APKScore = Math.ceil((productList[i].APK/maxAPKFound)*100)
  }
}

function addAPKtoProduct(product) {

  let price = parseFloat(product.Price);
  let volume = parseFloat(product.Volume);
  let alcohol = parseFloat(String(product.AlcoholPercentage).replace("%",""));
  let pant = product.RecycleFee;

  if(Number.isNaN(price) || Number.isNaN(volume) || Number.isNaN(alcohol)){
    console.error("---------------------")
    console.error("Fatal error in addAPKtoProduct. A value is NaN.")
    console.error("Price: " + price);
    console.error("volume: " + volume);
    console.error("alcohol: " + alcohol);
    console.error("---------------------")
    return -1;
  }

  product.APK = ((alcohol/100)*volume)/price;

  if(pant == undefined){
    product.APKWithPant = product.APK
  }else{
    product.APKWithPant = ((alcohol/100)*volume)/(price + parseFloat(pant));
  }
}

function isFloat(n) {
    return n === +n && n !== (n|0);
}

function isInteger(n) {
    return n === +n && n === (n|0);
}

String.prototype.replaceAll = function(str1, str2, ignore){
    return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
}

function resetProductArrays(){

  console.log("Resetting product arrays.")

  categoryList = {
    "red_wine": new Array(),
    "cider_and_mixed_drink": new Array(),
    "white_wine": new Array(),
    "spirits": new Array(),
    "sparkling_wine": new Array(),
    "beer": new Array(),
    "rose_wine": new Array(),
    "gifts": new Array(),
    "aperitif_and_dessert": new Array(),
    "alcohol_free": new Array(),

    "wine": new Array(), // Added as extra!
    "all": new Array(), // Added as extra!
    "all_sa": new Array(), // Added as extra!

    // Filteret out standard assortment (BS)
    "red_wine_sa": new Array(), // Added as extra! - Standard assortment
    "cider_and_mixed_drink_sa": new Array(), // Added as extra! - Standard assortment
    "white_wine_sa": new Array(), // Added as extra! - Standard assortment
    "spirits_sa": new Array(), // Added as extra! - Standard assortment
    "sparkling_wine_sa": new Array(), // Added as extra! - Standard assortment
    "beer_sa": new Array(), // Added as extra! - Standard assortment
    "rose_wine_sa": new Array(), // Added as extra! - Standard assortment
    "gifts_sa": new Array(), // Added as extra! - Standard assortment
    "aperitif_and_dessert_sa": new Array(), // Added as extra! - Standard assortment
    "alcohol_free_sa": new Array(), // Added as extra! - Standard assortment
    "wine_sa": new Array()  // Added as extra! - Standard assortment
  }
}

// Called to update all products
function reparseSystembolagetAPI(){
  console.log("Reparsing Systembolagets API")

  parseProducts()

  //updateDynamicDns()

}

// Make call to duckdns.org to update dynamic-IP skruvdragarn.duckdns.org
function updateDynamicDns(){
  console.log("Updating dns")

  let dnsToken = secret.duckdnsToken;

  request("https://www.duckdns.org/update?domains=skruvdragarn&token=" + dnsToken, function (error, response, body) {

    if (!error && response.statusCode == 200 && body == "OK") {
      console.log("Updating dns - DONE")
    }else{
      console.log("Could not update DNS. ERROR: \n" + response.statusCode + "-" + error)
    }

});
}

// Return sub-array of search result
function searchProductArray(arrayToSearch,searchString){
  var searchResult = [];

  if(searchString == "" || searchString == undefined || searchString == null){
    return searchResult;
  }

  // Searching ProductNameBold + ProductNameThin for 'searchString' --> Appending to resultList
  for (let i = 0; i < arrayToSearch.length; i++) {
      if(((arrayToSearch[i].ProductNameBold).toLowerCase()).includes(searchString.toLowerCase())){
        searchResult.push(arrayToSearch[i])
      }else if(arrayToSearch[i].ProductNameThin != null && (((arrayToSearch[i].ProductNameThin).toLowerCase()).includes(searchString.toLowerCase()))){
        searchResult.push(arrayToSearch[i])
      }
  }

  searchResult = searchResult.sort(function(a, b) {
    return parseFloat(b.APK) - parseFloat(a.APK);
  });

  return searchResult;
}

// Returns n nearest Systembolaget stores given long/lat
function getNearestStores(numberOfStores, lat, long){

  let nearbyStores = []

  for (var key in storesSlim) {
    // check if the property/key is defined in the object itself, not in parent
    if (stores.hasOwnProperty(key)) {           

      if(storesSlim[key].Address != null){

        let tempStore = storesSlim[key]

        nearbyStores.push(tempStore)
      } 
    }
  }
  
  if(!isNaN(lat) || !isNaN(long)){
    nearbyStores = nearbyStores.sort(function(a, b) {
      let distanceToStoreA = geolib.getDistance(
        { latitude: a.Position.Lat, longitude: a.Position.Long },
        { latitude: lat, longitude: long },1
      );
      let distanceToStoreB = geolib.getDistance(
        { latitude: b.Position.Lat, longitude: b.Position.Long },
        { latitude: lat, longitude: long },1
      );
  
      return distanceToStoreA - distanceToStoreB;
    });
  }

  // Return first numberOfStores stores if provided
  if(isInteger(numberOfStores)){
    nearbyStores = nearbyStores.slice(0,numberOfStores)
  }

  return nearbyStores
}

function parseStores(){
  console.log("parseStores()")

  // Reseting parsed stores before new parse
  stores = [];
  storesSlim = [];

  let beforeStoreParse = new Date();
  storesParsed = false;
  console.log("Parsing stores from API")

  // Get stores
  request({ url: storesAPIEndpoint, headers: APIHeaders }, function (error, response, body) {

    if (!error && response.statusCode == 200) {

      parsedStores = JSON.parse(body)

      // Get products in stores
      request({ url: productsWithStoreAPIEndpoint, headers: APIHeaders }, function (error, response, body) {

        if (!error && response.statusCode == 200) {
    
          productsWithStore = JSON.parse(body)

          // For each store - currentSiteId
          for(let storeIndex = 0; storeIndex < parsedStores.length; storeIndex++){

            let currentSiteId = parsedStores[storeIndex].SiteId;

            // For each productInStore (List with products in every store (with id)) - currentProductsWithStoreSiteId
            for(let productsWithStoreIndex = 0; productsWithStoreIndex < productsWithStore.length; productsWithStoreIndex++){
              let currentProductWithStore = productsWithStore[productsWithStoreIndex];

              if(currentProductWithStore['SiteId'] == currentSiteId){
                parsedStores[storeIndex]['ProductsIdList'] = currentProductWithStore.Products;
                break;
              } 
            }
          }

          // For each store
          for(let storeIndex = 0; storeIndex < parsedStores.length; storeIndex++){

            let currentStore = parsedStores[storeIndex]
            let currentStoreSiteId = currentStore.SiteId;
            
            //console.log("Mapping products for store " + currentStoreSiteId)

            // Filtering out non-stores
            if(currentStore.IsStore){

              // Used when returning stores. To minimize the JSON-size we remove some shit-attributes in that case
              storesSlim[currentStoreSiteId] = JSON.parse(JSON.stringify(parsedStores[storeIndex]));
              delete storesSlim[currentStoreSiteId].ProductsIdList
              delete storesSlim[currentStoreSiteId].Products
              delete storesSlim[currentStoreSiteId].IsStore
              delete storesSlim[currentStoreSiteId].Email
              delete storesSlim[currentStoreSiteId].Services
              delete storesSlim[currentStoreSiteId].Depot
              delete storesSlim[currentStoreSiteId].IsAgent
              delete storesSlim[currentStoreSiteId].Phone;

              stores[currentStoreSiteId] = parsedStores[storeIndex];
              stores[currentStoreSiteId].Products = [];

              // For each productId in store
              for(let productsInStoreIndex = 0; productsInStoreIndex < parsedStores[storeIndex]['ProductsIdList'].length; productsInStoreIndex++){
                
                let currentProductInStoreProductId = parsedStores[storeIndex]['ProductsIdList'][productsInStoreIndex].ProductId;

                // For each parsed product in full assorment
                // Searching for product with productId - Adding to store
                for(let parsedProductsIndex = 0; parsedProductsIndex < categoryList.all.length; parsedProductsIndex++){

                  let currentParsedProduct = categoryList.all[parsedProductsIndex];

                  if(currentParsedProduct.ProductId == currentProductInStoreProductId){
                    stores[currentStoreSiteId].Products.push(currentParsedProduct)
                    break;
                  }
                }
              }

              // Sorting
              stores[currentStoreSiteId].Products.sort(function(a, b) {
                return parseFloat(b.APK) - parseFloat(a.APK);
              });
            }
            
            // Removing stores with long/lat = 0
            removeStoresWithoutGPS(currentStore, currentStoreSiteId);
          } 
          
          storesParsed = true;
          console.log("parseStores() - DONE")
          console.log("Parse time: " + (new Date() - beforeStoreParse)/1000 + " s")
          
        }else{
          console.log("Error in parsing products in stores:" + response.statusCode + "-" + error)
          console.log(response.body)

          if(response.statusCode == 429){
            
            console.log("Taking a chill-pill and calling parseStores() in 60 sec")
            setTimeout(parseStores,60000)

          }

        }
      })

    }else{
      console.log("Error in parsing stores:" + response.statusCode + "-" + error)   
      console.log(response.body)

      if(response.statusCode == 429){
            
        console.log("Taking a chill-pill and calling parseStores() in 60 sec")
        setTimeout(parseStores,60000)

      }

    }
  })
}

function removeStoresWithoutGPS(currentStore, currentStoreSiteId) {
  if (currentStore.Position != undefined) {
    if (currentStore.Position.Long == 0 || currentStore.Position.Lat == 0) {
      console.log("Store ("+currentStoreSiteId+") missing GPS position - Deleted.: " + currentStore.Address + " " + currentStore.County);
      delete stores[currentStoreSiteId];
    }
  }
}

function testCategoryForBrokenURLS(productList){



}

function removeBrokenProductInCategoryList(ProductIdToRemove){
  console.log("removeBrokenProductInCategoryList() " + ProductIdToRemove)


  for(let category in categoryList){
    for(let productIndex in categoryList[category]){

      let currentProduct = categoryList[category][productIndex];
    
      if(currentProduct.ProductId == ProductIdToRemove){
        delete categoryList[category][productIndex];
        console.log("Deleted " + ProductIdToRemove + " from " + category)
      }
    }
  }
}

let productsChecked = 0;

let maxNumberOfConnections = 40; // With 70 it broke
let numberOfConnections = 0;

let categoriesToParse = []
let categoryIndex = 21;

let currentProductToCheckInCategoryIndex = 0;

let doingTryAgainProducts = false;
let tryAgainProducts = [];

let toBeRemovedProducts = [];
let doneWithTryAgainProducts = false;

function mainCool(){

  if(doneWithTryAgainProducts == true){
    return;
  }

  if(numberOfConnections <= maxNumberOfConnections){ // Test a new URL
    //console.log(categoriesToParse[categoryIndex] + "("+currentProductToCheckInCategoryIndex+")" + " Making a new connection #" + numberOfConnections)

    let currentProduct;    

    if(doingTryAgainProducts){
      currentProduct = tryAgainProducts[currentProductToCheckInCategoryIndex]
    }else{
      currentProduct = categoryList[categoriesToParse[categoryIndex]][currentProductToCheckInCategoryIndex]
    }

    if(currentProduct == undefined){ // odd special case

      return;

    }

    let currentProductURL = currentProduct.URL;

    //console.log("currentProductURL: " + currentProductURL)
      numberOfConnections++;
    request({ url: currentProductURL}, function (error, response, body) {
      
      numberOfConnections--;

      
      console.log(categoriesToParse[categoryIndex] + "("+currentProductToCheckInCategoryIndex+")" + " Connections #" + numberOfConnections + " tryAgainProducts.length: " + tryAgainProducts.length + " Progress: " + parseFloat(((productsChecked/totalURLsToCheck)*100)).toFixed(2) + " %")
      
      // Switch category (Reached last index of category)
      if(!doingTryAgainProducts && currentProductToCheckInCategoryIndex == categoryList[categoriesToParse[categoryIndex]].length){

        console.log("Done with " + categoriesToParse[categoryIndex])
        categoryIndex++;
        currentProductToCheckInCategoryIndex = 0;

        if(categoryIndex == categoriesToParse.length){ 
          console.log("DONE with ALL categories!")
          doingTryAgainProducts = true;
        }

      }else if(doingTryAgainProducts && currentProductToCheckInCategoryIndex == tryAgainProducts.length){ // Reached end of tryAgainProducts
        console.log("Done with tryAgainProducts.")

        console.log("Products with broken URL: " + toBeRemovedProducts.length)

        if(doneWithTryAgainProducts == false){
          doneWithTryAgainProducts = true;

          for(let toBeRemoveID in toBeRemovedProducts){
            removeBrokenProductInCategoryList(toBeRemovedProducts[toBeRemoveID].ProductId)
          }


          return;

        }else{
          return;
        }

      }

      currentProductToCheckInCategoryIndex++;
      productsChecked++;

      if(!error && response.statusCode == 404){ // Invalid URL
        toBeRemovedProducts.push(currentProduct);
      }else if(!error && response.statusCode == 200){ // Correct URL

      }else{ // non - 200/404 error when requesting URL

        console.log("Error on " + currentProduct.URL)
        if(response != undefined){
          console.log("code: " + response.statusCode)
        }else{
          console.log("response == undefined !")
        }

        //console.log("Error in parsing products in stores:" + response.statusCode + "-" + error)
        //console.log(response.body)
        console.log("Got error! " + error)
        //console.log("resp: " + JSON.stringify(response))

        //console.log("Waiting 2000 ms -> Doing retry round")
        
        tryAgainProducts.push(currentProduct)

      }

      mainCool()

    })

  }
}

let totalURLsToCheck = 0;

function setUpURLCheck(){

  for(let category in categoryList){

    if(categoryList[category].length != 0){ // Ignore empty categories
      categoriesToParse.push(category);
    }

    totalURLsToCheck += categoryList[category].length

  }
  
  for(let startingConnections = 0; startingConnections < maxNumberOfConnections; startingConnections++){
    mainCool()
  }

}

// Checking product list for 404 on URL
function searchForBrokenProductLinks(){
  console.log("searchForBrokenProductLinks")

  setUpURLCheck()

  console.log("searchForBrokenProductLinks - DONE")
}


function parseProducts(){

  startedParseDate = new Date()

  console.log("parseProducts()")

  // Reparsing everyday at 03:00
  var s = schedule.scheduleJob('0 3 * * *', function(){
    console.log("03:00 | Reparsing")
    reparseSystembolagetAPI()
    console.log("03:00 | Reparsing - DONE")
  });

  request({ url: productsAPIEndpoint, headers: APIHeaders }, function (error, response, body) {
    console.info('Download time: %dms', new Date() - startedParseDate)

    if (!error && response.statusCode == 200) {

      let parsedProducts = JSON.parse(body);

      let beforeProcessAndSortDate = new Date()
      processParsedProducts(parsedProducts)

      parsedProducts.sort(function(a, b) {
        return parseFloat(b.APK) - parseFloat(a.APK);
      });

      console.info('Processing + sorting time: %dms', new Date() - beforeProcessAndSortDate)
      console.log("Antal produkter: " + Object.keys(parsedProducts).length)

      createCategoryLists(parsedProducts);
      
      
      parseStores()

      //removeBrokenProductInCategoryList(507795)

      console.log("Parsed products, now searching for broken URLs in categoryList")    
      searchForBrokenProductLinks()

      lastParseDate = new Date()

      console.log("parseProducts() - DONE")
    }else{

      console.log("ERROR in parsing products: \n" + response.statusCode + "-" + error)
      console.log(response.body)

      if(response.statusCode == 429){
            
        console.log("Taking a chill-pill and calling parseProducts() in 60 sec")
        setTimeout(parseProducts,60000)

      }

    }
  })
}


function getProductsNeatly(req, res){

  if(categoryList.all == undefined){
    res.sendStatus(204)
  }else{
    
    let { store, category, search, postsPerPage, pageIndex } = getQueryParameters(req);
    
    let selectedArray; // Array to be returned

    let validStore = false;

    // Store-query is provided 
    if(store != undefined){

      // Check if correct store-siteId
      if(stores[store] == undefined){
        
        // Invalid store --> return []
        validStore = false;        
        res.json([]);
        return;

      }else{
        validStore = true;
        selectedArray = stores[store].Products
      }
    }

    // Selecting category
    if(category != undefined){

      // Certain category in _certain store_
      if(validStore){

        // Getting the stores products
        selectedArray = getCategoryFromStore(selectedArray, store, category);  

      }else{ // No store selected

        selectedArray = categoryList[category.toLowerCase()]

        // If category is invalid -> Return empty array
        if(selectedArray == undefined){
          res.json([]);
          return;
        }
      }
    }

    // Filter by search-string
    selectedArray = searchSelectedArray(search, selectedArray);

    // Pagination
    selectedArray = paginateSelectedArray(postsPerPage, pageIndex, selectedArray);

    /*
    console.log("\nRequest:");
    console.log(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + " GMT")
    console.log("Category: " + category)
    console.log("Pagination: from index " + startSliceIndex + " to " + endSliceIndex)
    console.log("Search: " + search)
    */
    
    res.json(selectedArray)
    return;
  }
}

function getQueryParameters(req) {
  let store = (req.query.store);
  let category = (req.query.category);
  let postsPerPage = Number(req.query.postsPerPage);
  let pageIndex = Number(req.query.pageIndex);
  let search = req.query.search;
  return { store, category, search, postsPerPage, pageIndex };
}

// filtering stores products by category
function getCategoryFromStore(selectedArray, store, category) {
  selectedArray = [];
  if (stores[store].Products == undefined) {
    console.log("stores[store].Products == undefined !");
    console.log(stores[store]);
  }
  for (let productIndex = 0; productIndex < stores[store].Products.length; productIndex++) {
    let currentProductsCategory = stores[store].Products[productIndex].Category;
    if (currentProductsCategory == category) {
      // Perfect match enteret-category and products
      selectedArray.push(stores[store].Products[productIndex]);
    }
    else if (category == 'wine') {
      // Wine contains all 4 wine categories
      if (currentProductsCategory == 'red_wine' || currentProductsCategory == 'white_wine' ||
        currentProductsCategory == 'sparkling_wine' || currentProductsCategory == 'rose_wine') {
        selectedArray.push(stores[store].Products[productIndex]);
      }
      // category "all" returns everything in store
    }
    else if (category == "all") {
      selectedArray.push(stores[store].Products[productIndex]);
    }
  }
  return selectedArray;
}

function searchSelectedArray(search, selectedArray) {
  if (search != undefined) {
    selectedArray = searchProductArray(selectedArray, search.replaceAll("\"", ""));
  }
  return selectedArray;
}

function paginateSelectedArray(postsPerPage, pageIndex, selectedArray) {
  if (isInteger(postsPerPage) && isInteger(pageIndex)) {
    var startSliceIndex = (pageIndex * postsPerPage);
    var endSliceIndex = (pageIndex * postsPerPage) + (postsPerPage);
    if (postsPerPage == 0) {
      // Requesting 0 posts per page --> Empty array
      selectedArray = [];
    }
    else if (startSliceIndex == endSliceIndex) {
      // request selecting 1 product
      selectedArray = selectedArray[startSliceIndex];
    }
    else {
      // If we are requesting a index outside category-array
      if (selectedArray.length < endSliceIndex) {
        endSliceIndex = selectedArray.length;
      }
      // If we are requesting a index outside category-array
      if (selectedArray.length < startSliceIndex) {
        selectedArray = [];
      }
      else {
        selectedArray = selectedArray.slice(startSliceIndex, endSliceIndex);
      }
    }
  }
  return selectedArray;
}

function openEndPoints(){
  
  app.get('/lastParse', (req, res) => {
    res.send(lastParseDate);
  })

  app.get('/categories', (req, res) => {
    var categoriesJSON = new Object();

    categoriesJSON.red_wine = categoryList.red_wine.length;
    categoriesJSON.white_wine = categoryList.white_wine.length;
    categoriesJSON.spirits = categoryList.spirits.length;
    categoriesJSON.cider_and_mixed_drink = categoryList.cider_and_mixed_drink.length;
    categoriesJSON.sparkling_wine = categoryList.sparkling_wine.length;
    categoriesJSON.beer = categoryList.beer.length;
    categoriesJSON.rose_wine = categoryList.rose_wine.length;
    categoriesJSON.gifts = categoryList.gifts.length;
    categoriesJSON.aperitif_and_dessert = categoryList.aperitif_and_dessert.length;
    categoriesJSON.alcohol_free = categoryList.alcohol_free.length;

    categoriesJSON.wine = categoryList.wine.length;
    categoriesJSON.wine_sa = categoryList.wine_sa.length;
    categoriesJSON.all = categoryList.all.length;
    categoriesJSON.all_sa = categoryList.all_sa.length;

    categoriesJSON.red_wine_sa = categoryList.red_wine_sa.length;
    categoriesJSON.white_wine_sa = categoryList.white_wine_sa.length;
    categoriesJSON.spirits_sa = categoryList.spirits_sa.length;
    categoriesJSON.cider_and_mixed_drink_sa = categoryList.cider_and_mixed_drink_sa.length;
    categoriesJSON.sparkling_wine_sa = categoryList.sparkling_wine_sa.length;
    categoriesJSON.beer_sa = categoryList.beer_sa.length;
    categoriesJSON.rose_wine_sa = categoryList.rose_wine_sa.length;
    categoriesJSON.gifts_sa = categoryList.gifts_sa.length;
    categoriesJSON.aperitif_and_dessert_sa = categoryList.aperitif_and_dessert_sa.length;
    categoriesJSON.alcohol_free_sa = categoryList.alcohol_free_sa.length;
    res.send(categoriesJSON);
  })

  // Documentation
  app.get('/', (req, res) => {
    var file = fs.readFileSync('./Documentation.md', 'utf8');
    res.send(marked(file.toString()));
  })

  // Endpoint for products
  app.get('/APKappen_v2/products', (req, res) => {
    getProductsNeatly(req,res)
  })

  // Endpoint for stores
  app.get('/APKappen_v2/stores', (req, res) => {

    let numberOfStores = Number(req.query.numberOfStores)
    let lat = Number(req.query.lat)
    let long = Number(req.query.long)

    res.json(getNearestStores(numberOfStores,lat,long))
  })

  app.listen(port, () => console.log(`Listening on port ${port}!\n`))

  // Endpoint for express-status-monitor
  provideStatusMonitor()
}

function provideStatusMonitor(){
  let statusMonitor = require('express-status-monitor')({title: "APKappen API monitor",
  healthChecks: [{
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/products?category=beer_sa&postsPerPage=1&pageIndex=10',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/products',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/stores',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/products?store=1443&category=beer&postsPerPage=240&pageIndex=1',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/stores?lat=60.33&long=20&numberOfStores=3',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/APKappen_v2/products?category=wine_sa',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/lastParse',
    port: '1337'
  }, {
    protocol: 'http',
    host: 'localhost',
    path: '/',
    port: '1337'
  }]});

  app.use(statusMonitor);
}

function main(){
  openEndPoints()
  reparseSystembolagetAPI()
}

main();
