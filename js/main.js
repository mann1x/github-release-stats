var apiRoot = "https://api.github.com/";
var asyncResults = -1;
var grandDownloadCount = 0;
var grandhtml = '';

function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split("&");
    for(var i = 0; i < vars.length; i++) {
        var pair = vars[i].split("=");
        if(pair[0] == variable) {
            return pair[1];
        }
    }
    return "";
}

// Validate the user input
function validateInput() {
    if ($("#username").val().length > 0 && $("#repository").val().length > 0) {
        $("#get-stats-button").prop("disabled", false);
    } else {
        $("#get-stats-button").prop("disabled", true);
    }
}

// Sleep function
const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}
// Focus on #username when document is ready
$(document).ready(function() {
    if (!$("#username").val()) {
        $("#username").focus();
    }
});

// Callback function for getting user repositories
function getUserRepos() {
    var user = $("#username").val();

    var autoComplete = $('#repository').typeahead();
    var repoNames = [];

    var url = apiRoot + "users/" + user + "/repos";
    $.getJSON(url, function (data) {
        $.each(data, function (index, item) {
            repoNames.push(item.name);
        });
    });

    autoComplete.data('typeahead').source = repoNames;
}

// Display the stats for a single repository
function showStats(data) {

    var err = false;
    var errMessage = '';
    var totalDownloadCount = 0;

    if(data.status == 404) {
        err = true;
        errMessage = "The project does not exist!";
    }

    if(data.status == 403) {
        err = true;
        errMessage = "You've exceeded GitHub's rate limiting.<br />Please try again in about an hour.";
    }

    if(data.length == 0) {
        err = true;
        errMessage = "There are no releases for this project";
    }

    var html = '';

    if(err) {
        html = "<div class='col-md-6 col-md-offset-3 error output'>" + errMessage + "</div>";
    } else {

        // Set title to username/repository
        document.title = $("#username").val() + "/" + $("#repository").val() + " - " + document.title;

        html += "<div class='col-md-6 col-md-offset-3 output'>";

        const { ret_html, ret_totalDownloadCount } = showRowStats(data);

        html += ret_html;

        totalDownloadCount += ret_totalDownloadCount;


        if(totalDownloadCount > 0) {
            totalDownloadCount = totalDownloadCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;');
            var totalHTML = "<div class='row total-downloads'>";
            totalHTML += "<h2><span class='glyphicon glyphicon-download'></span>" +
                "&nbsp&nbspTotal Downloads</h2> ";
            totalHTML += "<span>" + totalDownloadCount + "</span>";
            totalHTML += "</div>";
            html = totalHTML + html;
        }

        html += "</div>";
    }

    showResultsDiv(html);
}

 // Show the error message for the overview
function showErrorMessage(data) {
    var errMessage = '';

    if (data.status == 403) {
        errMessage = "You've exceeded GitHub's rate limiting.<br />Please try again in about an hour.";
    }

    if (data.status == 404) {
        errMessage = "The username does not exist!";
    }

    if (errMessage != '') {
        html = "<div class='col-md-6 col-md-offset-3 error output'>" + errMessage + "</div>";
    } else {
        html = "<div class='col-md-6 col-md-offset-3 error output'>Unknown error occurred</div>";
    }

    showResultsDiv(html);
}

// Show the results 
function showResultsDiv(html) {
    var resultDiv = $("#stats-result");

    resultDiv.hide();
    resultDiv.html(html);
    $("#loader-gif").hide();
    resultDiv.slideDown();
}

// Get repository for the overview
function getRepo(item) {
    return new Promise((resolve, reject) => {

        var user = $("#username").val();

        url = apiRoot + "repos/" + user + "/" + item.name + "/releases";

        $.getJSON(url, function (datarepo) {

            const { ret_html, ret_totalDownloadCount } = showRowStats(datarepo, item.name, item.updated_at);

            grandhtml = ret_html + grandhtml;
            grandDownloadCount += ret_totalDownloadCount;
        })
        .fail(function (data) {
            showErrorMessage(data);
        })
        .then(function () {
            asyncResults--;
        });

        resolve();
    });
}

// Throttle repository API calls for the overview
async function waitRepo(item) {
    await getRepo(item);
    return (await sleep(750));
}


// Parse the single repository and start the async query for the latest release
const showOverview = async (data) => {
//function showOverview(data) {

    if (data && data.length > 0) {
        startTime = new Date();

        // Sort by updated date
        data.sort(function (a, b) {
            return (a.updated_at > b.updated_at) ? 1 : -1;
        });

        asyncResults = data.length;

        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                await waitRepo(data[key]);
            }
        }

    }

}

// Get all the repos and start the task that waits the results for the stats overview for latest releases
function getOverview() {

    var user = $("#username").val();

    var url = apiRoot + "users/" + user + "/repos";

    // Set title to username/*
    document.title = $("#username").val() + "/* - " + document.title;
    
    $.getJSON(url, function (data) {
        showOverview(data);
    })
    .fail(function (data) {
        showErrorMessage(data);
    });

    waitResults();
}

// Wait for all async queries to terminate and show the releases and downloads grandtotal 
const waitResults = async () => {
    while (asyncResults != 0) {
        await sleep(100);
    }

    if (grandDownloadCount > 0) {
        grandDownloadCount = grandDownloadCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;');
        var totalHTML = "<div class='row total-downloads'>";
        totalHTML += "<h2><span class='glyphicon glyphicon-download'></span>" +
            "&nbsp&nbspTotal Downloads</h2> ";
        totalHTML += "<span>" + grandDownloadCount + "</span>";
        totalHTML += "</div>";
        grandhtml = totalHTML + grandhtml;
    }

    grandhtml = "<div class='col-md-6 col-md-offset-3 output'>" + grandhtml;
    grandhtml += "</div>";

    showResultsDiv(grandhtml);
}

// Show single or multiple release stats
const showRowStats = (data, repoName = '', updated_at = '') => {
    var html = '';

    var latest = true;
    var totalDownloadCount = 0;

    // Sort by publish date
    data.sort(function (a, b) {
        return (a.published_at < b.published_at) ? 1 : -1;
    });

    //Filter pre-release and draft if overview
    if (repoName.length > 0) {
        data.filter(function(a, b) {
            return b.draft == false && b.prerelease == false;
        });
    }

    $.each(data, function (index, item) {
        if (repoName.length > 0 && !latest) return;

        var releaseTag = item.tag_name;
        var releaseURL = item.html_url;
        var releaseAssets = item.assets;
        var hasAssets = releaseAssets.length != 0;
        var releaseAuthor = item.author;
        var hasAuthor = releaseAuthor != null;
        var publishDate = item.published_at.split("T")[0];
        var updateDate = "";
        if (updated_at.length > 0) updateDate = updated_at.split("T")[0];
        var ReleaseDownloadCount = 0;
        var latestRelease = "Latest Release: " + releaseTag;
        var downloadInfoHTML = '';
        if (repoName.length > 0) latestRelease = repoName + " " + releaseTag;

        if (latest) {
            html += "<div class='row release latest-release'>" +
                "<h2><a href='" + releaseURL + "' target='_blank'>" +
                "<span class='glyphicon glyphicon-tag'></span>&nbsp&nbsp" +
                latestRelease +
                "</a></h2><hr class='latest-release-hr'>";
            latest = false;
        } else {
            html += "<div class='row release'>" +
                "<h4><a href='" + releaseURL + "' target='_blank'>" +
                "<span class='glyphicon glyphicon-tag'></span>&nbsp&nbsp" +
                releaseTag +
                "</a></h4><hr class='release-hr'>";
        }

        if (hasAssets) {
            downloadInfoHTML = "<h4><span class='glyphicon glyphicon-download'></span>" +
                "&nbsp&nbspDownload Info: </h4>";
            downloadInfoHTML += "<ul>";
            html += "<ul>";
            $.each(releaseAssets, function (index, asset) {
                var assetSize = (asset.size / 1048576.0).toFixed(2).replace(/\./, ',');
                var lastUpdate = asset.updated_at.split("T")[0];
                downloadInfoHTML += "<li><a href=\"" + asset.browser_download_url + "\">" + asset.name + "</a> (" + assetSize + " MiB)<br>" +
                    "<i>Last updated on " + lastUpdate + " &mdash; Downloaded " +
                    asset.download_count.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;');
                asset.download_count == 1 ? downloadInfoHTML += " time</i></li>" : downloadInfoHTML += " times</i></li>";
                totalDownloadCount += asset.download_count;
                ReleaseDownloadCount += asset.download_count;
            });
        }

        if (updateDate.length > 0) {
            html += "<h4><span class='glyphicon glyphicon-info-sign'></span>&nbsp&nbsp" +
                "Repository Info:</h4>";

            html += "<ul style=\"list-style-type:none\">";

            html += "<li><span class='glyphicon glyphicon-calendar'></span>&nbsp&nbspUpdated on: " +
                    updateDate + "</li>";

            var repourl = new URL(window.location.href);
            repourl.searchParams.set('repository', repoName);

            html += "<li><span class='glyphicon glyphicon-user'></span>&nbsp&nbsp<a href='" + repourl + "'>" + repoName + " statistics</a></li>";

            html += "</ul>";
        }

        html += "<h4><span class='glyphicon glyphicon-info-sign'></span>&nbsp&nbsp" +
            "Release Info:</h4>";

        html += "<ul style=\"list-style-type:none\">";

        html += "<li><span class='glyphicon glyphicon-calendar'></span>&nbsp&nbspPublished on: " +
            publishDate + "</li>";

        if (hasAuthor) {
            html += "<li><span class='glyphicon glyphicon-user'></span>&nbsp&nbspRelease Author: " +
                "<a href='" + releaseAuthor.html_url + "'>" + releaseAuthor.login + "</a><br></li>";
        }

        html += "<li><span class='glyphicon glyphicon-download'></span>&nbsp&nbspDownloads: " +
            ReleaseDownloadCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;') + "</li>";

        html += "</ul>";

        html += downloadInfoHTML;

        html += "</div>";

    });

    const ret_html = html;
    const ret_totalDownloadCount = totalDownloadCount;
    return { ret_html, ret_totalDownloadCount };

}

// Callback function for getting release stats
function getStats() {
    var user = $("#username").val();
    var repository = $("#repository").val();

    var url = apiRoot + "repos/" + user + "/" + repository + "/releases";
    $.getJSON(url, showStats).fail(showStats);
}

// The main function
$(function() {
    $("#loader-gif").hide();

    validateInput();
    $("#username, #repository").keyup(validateInput);

    $("#username").change(getUserRepos);

    $("#get-stats-button").click(function() {
        window.location = "?username=" + $("#username").val() +
            "&repository=" + $("#repository").val();
    });

    $('#repository').on('keypress',function(e) {
        if(e.which == 13) {
            window.location = "?username=" + $("#username").val() +
            "&repository=" + $("#repository").val();
        }
    });

    var username = getQueryVariable("username");
    var repository = getQueryVariable("repository");

    if(username != "" && repository != "") {
        $("#username").val(username);
        $("#repository").val(repository);
        validateInput();
        getUserRepos();
        $(".output").hide();
        $("#description").hide();
        $("#loader-gif").show();
        if (repository == "*") {
            getOverview();
        } else {
            getStats();
        }
    }
});
