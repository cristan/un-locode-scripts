const {readCsv} = require("./util/readCsv")
const {convertToDecimal} = require("./util/coordinatesConverter")
const {getNominatimData, getSubdivisionCode} = require("./util/nominatim-loader")

async function validateCoordinates() {
    const csvDatabase = await readCsv()

    for (const unlocode of Object.keys(csvDatabase)) {
        const entry = csvDatabase[unlocode]

        const decimalCoordinates = convertToDecimal(entry.coordinates)
        if (!decimalCoordinates || entry.country !== "IT") {
            continue
        }

        const nominatimData = await getNominatimData(unlocode)
        if (!nominatimData) {
            // Nominatim can't find it, which most likely means a non-standard name is found.
            // For example ITMND which has the name "Mondello, Palermo" or ITAQW with the name "Acconia Di Curinga"
            // These should be called "Mondello" and "Acconia" to be found in nominatim.

            // Let's ignore this for now because these 2 examples are actually fine.
            continue
        }

        const scrapeType = nominatimData.scrapeType
        const nominatimResult = nominatimData.result

        const lat = nominatimResult[0].lat;
        const lon = nominatimResult[0].lon;
        const countyCode = nominatimResult[0].address["ISO3166-2-lvl6"];
        const stateCode = nominatimResult[0].address["ISO3166-2-lvl4"];
        const state = nominatimResult[0].address.state;
        const county = nominatimResult[0].address.county;

        const distance = Math.round(getDistanceFromLatLonInKm(decimalCoordinates.latitude, decimalCoordinates.longitude, lat, lon));

        // TODO: when there's no subdivisionCode and there are more than 1 subdivisions in the nominatim results, suggest setting the region to the one of the closest nominatim entry
        //  if that's within 25 km + the diameter of the bounding box / 2

        if (distance > 100) {
            let nominatimQuery = `https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=en&addressdetails=1&limit=20&city=${encodeURI(entry.city)}&country=${encodeURI(entry.country)}`
            if (scrapeType === "byRegion") {
                nominatimQuery += `&state=${encodeURI(state)}`
            }

            if (scrapeType === "byRegion" && getSubdivisionCode(nominatimResult[0]) !== entry.subdivisionCode) {
                throw new Error(`${unlocode} has unexpected region stuff going on`)
            }

            if (!entry.subdivisionCode) {
                // It could be that the first result is just the wrong one. Let's see if we can find a close one (which probably is the correct one)
                const closeResults = nominatimResult.filter(n => {
                    return getDistanceFromLatLonInKm(decimalCoordinates.latitude, decimalCoordinates.longitude, n.lat, n.lon) < 25
                })
                if (closeResults.length !== 0) {
                    const subdivisionCodes = closeResults.map(nd => getSubdivisionCode(nd))
                    const uniqueSubdivisionCodes = [...new Set(subdivisionCodes)]
                    const extraLog = `${Array.from(uniqueSubdivisionCodes).join(' or ')} to avoid the confusion.`
                    console.log(`https://unlocode.info/${unlocode}: (${entry.city}): There are ${nominatimResult.length} different results for ${entry.city} in ${entry.country}. Let's set the region to ${extraLog}`)
                } else {
                    // TODO: something
                    console.log("HALP!")
                }
            }
            else if (scrapeType === "byCity" && getSubdivisionCode(nominatimResult[0]) !== entry.subdivisionCode) {
                const subdivisionCodes = nominatimResult.map(nd => getSubdivisionCode(nd))
                const uniqueSubdivisionCodes = [...new Set(subdivisionCodes)]
                console.log(`https://unlocode.info/${unlocode}: (${entry.city}): No ${entry.city} found in ${entry.subdivisionCode}! The subdivision code and coordinates should probably be updated to ${entry.city} in ${Array.from(uniqueSubdivisionCodes).join(' or ')}`)
            } else {
                console.log(`https://unlocode.info/${unlocode}: (${entry.city}), // ${entry.subdivisionCode}${entry.subdivisionName ? ` => ${entry.subdivisionName}` : ""} vs ${countyCode ? countyCode + " => " : ""}${county} ${decimalCoordinates.latitude}, ${decimalCoordinates.longitude} vs ${lat}, ${lon} => ${distance} km apart. ${nominatimQuery}`)
            }

        }
    }
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371 // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1) // deg2rad below
    const dLon = deg2rad(lon2 - lon1)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const d = R * c // Distance in km
    return d
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

validateCoordinates()