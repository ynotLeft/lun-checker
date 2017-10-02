const fs = require('fs');
const request = require('request');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');

const apartDivClass = "realty-card-inner";
const apartLinkClass = "realty-card-header__link-wrapper";
const apartAddTimeClass = "realty-card-characteristics__add-time";

const host = "https://www.lun.ua/a";

(function () {
    const constants = JSON.parse(fs.readFileSync('constants.json', 'utf8'));
    let transporter;

    function sendEmail(links, linkName) {
        transporter = setUpMailer(linkName);

        transporter.mailOptions.html = "<ol>";
        for (const link of links) {
            transporter.mailOptions.html += "<li><a>" + link + "</a></li>";
        }
        transporter.mailOptions.html += "</ol>";
        transporter.sendMail(transporter.mailOptions, function (error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
    }

    function extractTime(timeString) {
        const hours = timeString.match("(\\d+):(\\d+)")[1];
        const minutes = timeString.match("(\\d+):(\\d+)")[2];
        const date = new Date();

        // Magic. Should investigate what's up with timezone in node.
        date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
        date.setHours(hours - date.getTimezoneOffset() / 60, minutes);

        return date;
    }

    function isFreshApartment(addTime, currentDate) {
        return currentDate - addTime <= constants.interval;
    }

    function extractApartmentLinks(html) {
        const $ = cheerio.load(html);
        const currentDate = new Date();
        currentDate.setTime(currentDate.getTime() - currentDate.getTimezoneOffset() * 60 * 1000);
        const result = [];
        $("." + apartDivClass).each(function () {
            const addTimeString = $(this).find($("." + apartAddTimeClass)).text();
            const link = $(this).find($("." + apartLinkClass)).attr('href');
            const addTime = extractTime(addTimeString);
            if (isFreshApartment(addTime, currentDate)) {
                result.push(host + link);
            }
        });
        return result;
    }

    function onRequestLunSuccess(html, linkName) {
        const freshApartmentLinks = extractApartmentLinks(html);
        if (freshApartmentLinks && freshApartmentLinks.length > 0) {
            console.log(freshApartmentLinks.length + " new apartments");
            sendEmail(freshApartmentLinks, linkName);
        }
    }

    function requestLun(url) {
        request(url.link, function (error, response, html) {
            if (!error) {
                console.log("GET page success");
                onRequestLunSuccess(html, url.name);
            }
            else {
                console.error(error);
            }
        });
    }

    function setUpMailer(linkName) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: constants.sendingEmail,
                pass: constants.sendingPassword,
            }
        });

        transporter.mailOptions = {
            from: constants.sendingEmail,
            to: constants.recipients.join(", "),
            subject: 'новая квартирка ' + linkName + "" + new Date(),
        };
        return transporter;
    }

    function start() {
        for (const url of constants.urls) {
            requestLun(url);
            setInterval(() => {
                requestLun(url);
            }, constants.interval);
        }
    }

    start();
})();
