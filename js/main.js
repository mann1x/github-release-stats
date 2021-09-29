var apiRoot = "https://api.github.com/";

var asyncResults = -1;
var asyncResultsTotal = 0;
var ratelimit_limit = -1;
var ratelimit_remaining = -1;
var latestReleases = '';
var singleRelease = '';
var api_token = '';
var api_token_valid = true;
var link_header = '';
var lastPos = 0;
var asyncFail = false;

//Initialize pagination values
var perPage = Cookies.get("per_page") || 5;
var perPageIndex = Cookies.get("per_page_index") || 1;

var page = sessionStorage.getItem("page") || 1;
var numPages = sessionStorage.getItem("num_pages") || 1;

if (window.location.protocol == "file:") {
    perPage = window.localStorage.getItem('per_page') || 5;
    perPageIndex = window.localStorage.getItem('per_page_index') || 1;
}

//Get query string variable
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

// Format numbers
function formatNumber(value) {
    return value.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,')
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

    if (user.length) {
        var autoComplete = $('#repository').typeahead();
        var repoNames = [];

        var url = apiRoot + "users/" + user + "/repos?per_page=100";

        var xhr = $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            beforeSend: setTokenAuth
        })
        .done(function (data) {
            $.each(data, function (index, item) {
                repoNames.push(item.name);
            });
        })
        .fail(function (data) {
            if (data) {
                if (data.status == 401 && api_token.length > 0) {
                    api_token_valid = false;
                    $('#change-api-label').css('color', '#FF2D00');
                }
            }
        })
        .always(function () {
            ratelimit_limit = xhr.getResponseHeader("x-ratelimit-limit");
            ratelimit_remaining = xhr.getResponseHeader("x-ratelimit-remaining");
            updateRateLimit(ratelimit_remaining, ratelimit_limit);
        });
   
        autoComplete.data('typeahead').source = repoNames;
    }
}

 // Show the error message for the overview
function showErrorMessage(data) {
    var errMessage = '';

    if (typeof data === 'object') {
        if (data.status == 403) {
            errMessage = "You've exceeded GitHub's rate limiting.<br />Please try again in about an hour.";
        }

        if (data.status == 404) {
            errMessage = "The username does not exist!";
        }

        if (data.status == 401) {
            err = true;
            errMessage = "You are not authorized!";
            if (api_token.length > 0) {
                errMessage += "<br />Your API token is set and probably not valid";
                $('#change-api-label').css('color', '#FF2D00');
            }
        }

    } else if (data !== null) {
        errMessage = data;
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

    $("#loader-gif").hide();
    $("#progress-div").hide();

    resultDiv.hide();
    resultDiv.html(html);
    resultDiv.show();
}

//Set authorization token
function setTokenAuth(xhr) {
    api_token = getToken();
    if (api_token.length > 0) xhr.setRequestHeader('Authorization', 'token ' + api_token);
}

// Get single repository async for the overview
function getRepoLatest(item) {
    return new Promise((resolve, reject) => {

        var user = $("#username").val();

        url = apiRoot + "repos/" + user + "/" + item.name + "/releases/latest";

        var xhr = $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            beforeSend: setTokenAuth
        })
        .done(function (data) {
            asyncResults--;
            var _comma = ", ";
            if (latestReleases == null) {
                _comma = '';
                latestReleases = '';
            }
            latestReleases += _comma + JSON.stringify(data);
        })
        .fail(function () {
            asyncResults--;
        })
        .always(function () {
            ratelimit_limit = xhr.getResponseHeader("x-ratelimit-limit");
            ratelimit_remaining = xhr.getResponseHeader("x-ratelimit-remaining");
            updateRateLimit(ratelimit_remaining, ratelimit_limit);
        });

        resolve();
    });
}

// Get single repository async
function getRepoSingle() {
    return new Promise((resolve, reject) => {

        var user = $("#username").val();
        var repository = $("#repository").val();

        var url = apiRoot + "repos/" + user + "/" + repository + "/releases" +
            "?page=" + page + "&per_page=" + perPage;

        if (ratelimit_remaining > 0 || ratelimit_remaining == -1) {

            var xhr = $.ajax({
                url: url,
                type: 'GET',
                dataType: 'json',
                beforeSend: setTokenAuth
            })
            .done(function (data) {
                asyncResults--;
                asyncFail = false;
                singleRelease = data;
            })
            .fail(function (data) {
                asyncResults--;
                asyncFail = true;
                singleRelease = data;
            })
            .always(function () {
                ratelimit_limit = xhr.getResponseHeader("x-ratelimit-limit");
                ratelimit_remaining = xhr.getResponseHeader("x-ratelimit-remaining");
                updateRateLimit(ratelimit_remaining, ratelimit_limit);
                link_header = xhr.getResponseHeader("link");
            });
        }

        resolve();
    });
}


// Throttle repository API calls for the overview
async function waitRepo(item) {
    await getRepoLatest(item);
    return (await sleep(50));
}

// Parse the single repository and start the async query for the latest release
const showOverview = async (data) => {

    if (data && data.length > 0) {

        asyncResults = data.length;
        asyncResultsTotal = data.length;

        latestReleases = null;

        for (let key in data) {
            if (data.hasOwnProperty(key)) {
                await waitRepo(data[key]);
            }
        }
    }
}

// Callback for single repo async result
const getSingleRepo = async () => {
    asyncResults = 1;
    asyncResultsTotal = 1;
    await getRepoSingle();

    waitSingleResult();
}

// Get all the repos and start the task that waits the results for the stats overview for latest releases
function getOverview() {

    var user = $("#username").val();

    var url = apiRoot + "users/" + user + "/repos?per_page=100";
  
    var xhr = $.ajax({
        url: url,
        type: 'GET',
        dataType: 'json',
        beforeSend: setTokenAuth
    })
    .done(function (data) {
        showOverview(data);
    })
    .always(function () {
        ratelimit_limit = xhr.getResponseHeader("x-ratelimit-limit");
        ratelimit_remaining = xhr.getResponseHeader("x-ratelimit-remaining");
        updateRateLimit(ratelimit_remaining, ratelimit_limit);
    })
    .fail(function (data) {
        showErrorMessage(data);
    });

    waitResults();
}
// Update rate limit display after async request
function updateRateLimit(remaining, limit) {
    var rate_limit_percentage = ~~(100 * remaining / limit);
    $("#ratelimit-div").show();
    $("#ratelimit-div").html("Rate limit API: " + rate_limit_percentage + "%");
    if (rate_limit_percentage < 10) $("#ratelimit-div").css('color', '#FF2D00');
}

// Wait for all async queries to terminate and show the releases
const waitResults = async () => {
    while (asyncResults != 0) {
        var percentage = ~~(100 - (100 * asyncResults / asyncResultsTotal));
        if (percentage > 0) $("#progress-div").html(percentage + " %");
        await sleep(100);
    }

    if (latestReleases) {
        if (latestReleases.length > 0) {
            var totalDownloadCount = 0;
            var html = '';

            latestReleases = "[" + latestReleases + "]";

            html += "<div class='col-md-6 col-md-offset-3 output'>";

            const { ret_html, ret_totalDownloadCount } = showLatestStats(JSON.parse(latestReleases));

            html += ret_html;

            totalDownloadCount += ret_totalDownloadCount;

            if (totalDownloadCount > 0) {
                totalDownloadCount = totalDownloadCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;');
                var totalHTML = "<div class='row total-downloads'>";
                totalHTML += "<h2><span class='glyphicon glyphicon-download'></span><span>" +
                    "&nbsp&nbspTotal&nbspDownloads:&nbsp&nbsp";
                totalHTML += "<b>" + totalDownloadCount + "</b></h2></span>";
                totalHTML += "</div>";
                html = totalHTML + html;
            }

            html += "</div>";

            showResultsDiv(html);

        } else {
            showErrorMessage("No releases found");
        }
    } else {
        showErrorMessage("No releases found");
    }
}

// Wait for the async query to terminate and show the releases
const waitSingleResult = async () => {
    while (asyncResults != 0) {
        var percentage = ~~(100 - (100 * asyncResults / asyncResultsTotal));
        if (percentage > 0) $("#progress-div").html(percentage + " %");
        await sleep(10);
    }


    if (asyncFail) {
        showErrorMessage(singleRelease);
    } else {
        if (singleRelease) {
            if (singleRelease.length > 0) {
            
                var totalDownloadCount = 0;
                var html = '';

                html += "<div class='col-md-6 col-md-offset-3 output'>";

                const { ret_html, ret_totalDownloadCount } = showRowStats(singleRelease);

                html += ret_html;

                totalDownloadCount += ret_totalDownloadCount;
                if (totalDownloadCount > 0) {
                    totalDownloadCount = totalDownloadCount.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1&#8239;');
                    var totalHTML = "<div class='row total-downloads'>";
                    totalHTML += "<h2><span class='glyphicon glyphicon-download'></span><span>" +
                        "&nbsp&nbspTotal&nbspDownloads:&nbsp&nbsp";
                    totalHTML += "<b>" + totalDownloadCount + "</b></h2></span>";
                    totalHTML += "</div>";
                    html = totalHTML + html;
                }

                html += "</div>";

                showResultsDiv(html);

                $("#toppager-div").show();
                $("#bottompager-div").show();

            } else {
                showErrorMessage("No releases found");
            }
        } else {
        showErrorMessage("No releases found");
        }
    }
}

// Show latest releases stats
const showLatestStats = (data) => {
    var html = '';

    var totalDownloadCount = 0;

    if (data.hasOwnProperty["published_at"]) {
        data.sort(function (a, b) {
            return (a.published_at < b.published_at) ? 1 : -1;
        });
    }

    $.each(data, function (index, item) {

        var urlRegex = new RegExp('\/repos\/(.*)\/(.*)\/releases\/', 'gi');
        var urlArray = urlRegex.exec(item.url);

        var repoName = urlArray[2];

        var releaseAuthor = item.author;
        
        var releaseTag = repoName + " "+ item.tag_name;
        var releaseURL = item.html_url;
        var releaseAssets = item.assets;
        var hasAssets = releaseAssets.length != 0;
        var hasAuthor = releaseAuthor != null;
        var publishDate = item.published_at.split("T")[0];
        var ReleaseDownloadCount = 0;
        var downloadInfoHTML = '';
        var releaseBadge = "&nbsp;&nbsp;<span class='badge'>Latest release</span>";
        var releaseClassNames = "release latest-release";

        html += "<div class='row " + releaseClassNames + "'>";

        html += "<h3><span class='glyphicon glyphicon-tag'></span>&nbsp;&nbsp;" +
            "<a href='" + releaseURL + "' target='_blank'>" + releaseTag + "</a>" +
            releaseBadge + "</h3>" + "<hr class='release-hr'>";

        html += "<ul>";

        if (hasAssets) {
            downloadInfoHTML = "<h4><span class='glyphicon glyphicon-download'></span>" +
                "&nbsp&nbspDownload Info: </h4>";
            downloadInfoHTML += "<ul>";
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
            downloadInfoHTML += "</ul>";
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

        html += "<li><span class='glyphicon glyphicon-list-alt'></span>&nbsp&nbsp<a href=\'?username=" + $("#username").val() +
            "&repository=" + repoName + "'>List all releases</a>";

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
// Show release stats
const showRowStats = (data) => {
    var html = '';

    var isLatestRelease = page == 1 ? true : false;

    var totalDownloadCount = 0;

    // Sort by publish date
    data.sort(function (a, b) {
        return (a.published_at < b.published_at) ? 1 : -1;
    });

    if (link_header == null) {
        numPages = 1;
        updatePagination(1, numPages);
    } else if (link_header.length > 0) {
        var _first = null;
        var _last = null;
        var _next = null;
        var _prev = null;

        if (link_header.match(/page=(\d+)&per_page=\d+>; rel="first".*/)) {
            _first = parseInt(link_header.match(/page=(\d+)&per_page=\d+>; rel="first".*/)[1]);
        }
        if (link_header.match(/page=(\d+)&per_page=\d+>; rel="last".*/)) {
            _last = parseInt(link_header.match(/page=(\d+)&per_page=\d+>; rel="last".*/)[1]);
        }
        if (link_header.match(/page=(\d+)&per_page=\d+>; rel="next".*/)) {
            _next = parseInt(link_header.match(/page=(\d+)&per_page=\d+>; rel="next".*/)[1]);
        }
        if (link_header.match(/page=(\d+)&per_page=\d+>; rel="prev".*/)) {
            _prev = parseInt(link_header.match(/page=(\d+)&per_page=\d+>; rel="prev".*/)[1]);
        }

        if (!_last) _last = _prev + 1;
        updatePagination(_last * perPage, _last);
    }

    $.each(data, function (index, item) {
        var releaseTag = item.tag_name;
        var releaseBadge = "";
        var releaseClassNames = "release";
        var isPreRelease = item.prerelease;
        var releaseURL = item.html_url;
        var releaseAssets = item.assets;
        var releaseAuthor = item.author;
        var releaseDownloadCount = 0;
        var publishDate = item.published_at.split("T")[0];

        if (isPreRelease) {
            releaseBadge = "&nbsp;&nbsp;<span class='badge'>Pre-release</span>";
            releaseClassNames += " pre-release";
        } else if (isLatestRelease) {
            releaseBadge = "&nbsp;&nbsp;<span class='badge'>Latest release</span>";
            releaseClassNames += " latest-release";
            isLatestRelease = false;
        }

        var downloadInfoHTML = "";

        if (releaseAssets.length) {
            downloadInfoHTML = "<h4><span class='glyphicon glyphicon-download'></span>" +
                "&nbsp&nbspDownload Info: </h4>";
            downloadInfoHTML += "<ul>";
            $.each(releaseAssets, function (index, asset) {
                var assetSize = (asset.size / 1048576.0).toFixed(2).replace(/\./, ',');
                var lastUpdate = asset.updated_at.split("T")[0];

                downloadInfoHTML += "<li><a href=\"" + asset.browser_download_url + "\">" + asset.name + "</a> (" + assetSize + " MiB)<br>" +
                    "<i>Last updated on " + lastUpdate + " &mdash; Downloaded " + formatNumber(asset.download_count);
                asset.download_count == 1 ? downloadInfoHTML += " time</i></li>" : downloadInfoHTML += " times</i></li>";

                totalDownloadCount += asset.download_count;
                releaseDownloadCount += asset.download_count;
            });
            downloadInfoHTML += "</ul>";
        }
        else {
            downloadInfoHTML = "<h4><span class='glyphicon glyphicon-download'></span>&nbsp&nbspThis release has now download assets</h4>"
        }

        html += "<div class='row " + releaseClassNames + "'>";

        html += "<h3><span class='glyphicon glyphicon-tag'></span>&nbsp;&nbsp;" +
            "<a href='" + releaseURL + "' target='_blank'>" + releaseTag + "</a>" +
            releaseBadge + "</h3>" + "<hr class='release-hr'>";

        html += "<h4><span class='glyphicon glyphicon-info-sign'></span>&nbsp;&nbsp;" +
            "Release Info</h4>";

        html += "<ul>";

        if (releaseAuthor) {
            html += "<li><span class='glyphicon glyphicon-user'></span>&nbsp;&nbsp;" +
                "Author: <a href='" + releaseAuthor.html_url + "'>@" + releaseAuthor.login + "</a></li>";
        }

        html += "<li><span class='glyphicon glyphicon-calendar'></span>&nbsp;&nbsp;" +
            "Published: " + publishDate + "</li>";

        if (releaseDownloadCount) {
            html += "<li><span class='glyphicon glyphicon-download'></span>&nbsp;&nbsp;" +
                "Downloads: " + formatNumber(releaseDownloadCount) + "</li>";
        }

        html += "</ul>";

        html += downloadInfoHTML;

        html += "</div>";

    });

    const ret_html = html;
    const ret_totalDownloadCount = totalDownloadCount;
    return { ret_html, ret_totalDownloadCount };
}

// Set and save (in a cookie or localStorage) the API token 
function setToken() {
    if ($("#token").val().length > 0) {
        if (window.location.protocol == "file:") {
            $('#set-api-label').hide();
            $('#change-api-label').show();
            $('#change-api-label').css('color', '#228B22');
            window.localStorage.setItem('api_token', $("#token").val());
        } else {
            $('#set-api-label').hide();
            $('#change-api-label').show();
            $('#change-api-label').css('color', '#228B22');
            Cookies.set("api_token", $("#token").val());
        }
        api_token = $("#token").val();
    } else {
        if (window.location.protocol == "file:") {
            window.localStorage.removeItem('api_token');
        } else {
            Cookies.remove("api_token");
            console.log("API Token Cookie removed");
        }
        $('#set-api-label').show();
        $('#change-api-label').hide();
        api_token = '';
    }
    $("#settoken-div").hide();
}

// Get (from a cookie or localStorage) the API token 
function getToken() {
    var _token = "";
    if (window.location.protocol == "file:") {
        _token = window.localStorage.getItem('api_token');
    } else {
        _token = Cookies.get("api_token");
    }
    if (!_token) return "";
    return _token;
}

// Update the pagination
function updatePagination(_numItems, _numPages) {
    sessionStorage.setItem("page", page);
    sessionStorage.setItem("num_pages", _numPages);
    sessionStorage.setItem("username", $("#username").val());
    sessionStorage.setItem("repository", $("#repository").val());
    $("#top-pagination").pagination('updateItems', _numPages);
    $("#bottom-pagination").pagination('updateItems', _numPages);
    $("#top-pagination").pagination('drawPage', page);
    $("#bottom-pagination").pagination('drawPage', page);
}

// Click on the items per page 
function perPageClick(_pageNumber, otherPerPage) {
    switch (_pageNumber) {
        case 1:
            pageNumber = 5;
            break;
        case 2:
            pageNumber = 10;
            break;
        case 3:
            pageNumber = 25;
            break;
        case 4:
            pageNumber = 50;
            break;
    }
    if (pageNumber != perPage) {
        if (window.location.protocol == "file:") {
            window.localStorage.setItem('per_page', pageNumber);
            window.localStorage.setItem('per_page_index', _pageNumber);
        } else {
            Cookies.set("per_page", pageNumber);
            Cookies.set("per_page_index", _pageNumber);
        }
        perPage = pageNumber;
        perPageIndex = _pageNumber;
        $(otherPerPage).pagination('drawPage', _pageNumber);
        page = 1;
        lastPos = $(window).scrollTop();
        getSingleRepo();
    }
}

// Click on the page
function PageClick(_pageNumber) {
    if (_pageNumber != page) {
        sessionStorage.setItem("page", _pageNumber);
        page = _pageNumber;
        lastPos = $(window).scrollTop();
        getSingleRepo();
    }
}

//Bind to anchor change to remove pagination anchors
$(window).bind('hashchange', function (event) {
    location.hash = '';
    var hash = location.hash.replace('#', '');
    if (typeof window.history.replaceState == 'function' && window.location.href.slice(-1) == '#') {
        history.replaceState({}, '', window.location.href.slice(0, -1));
    }
    if (hash == '') $(window).scrollTop(lastPos);
});


// The main function
$(function() {

    $("#loader-gif").hide();
    $("#progress-div").hide();
    $("#ratelimit-div").hide();
    $("#settoken-div").hide();
    $('#set-api-label').show();
    $('#change-api-label').hide();

    $('#settoken-btn').click(function (ev) {
        $('#settoken-div').toggle();
    })

    if (window.location.protocol == "file:") {
        perPage = window.localStorage.getItem('per_page');
        perPageIndex = window.localStorage.getItem('per_page_index');
    }

    $(document).ready(function () {
        // check API token cookie
        api_token = getToken()

        if (api_token != "") {
            $('#set-api-label').hide();
            $('#change-api-label').show();
            if (api_token_valid) {
                $('#change-api-label').css('color', '#228B22');
            } else {
                $('#change-api-label').css('color', '#FF2D00');
            }
        }
    });

    $("#submit-token").button().on("click", function () {
        setToken();
    });

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

    if (sessionStorage.getItem("username") != username || sessionStorage.getItem("repository") != repository) {
        sessionStorage.clear();
        page = 1;
    }

    $("#title").hide();
    $("#toppager-div").hide();
    $("#bottompager-div").hide();

    if (username != "" && repository != "") {
        $("#username").val(username);
        $("#repository").val(repository);
        $("#title .username").text(username);
        $("#repository").val(repository);
        $("#title .repository").text(repository);
        $("#per-page select").val(perPage);

        validateInput();
        getUserRepos();

        $(".output").hide();
        $("#description").hide();
        $("#loader-gif").show();

        if (repository == "*") {

            $("#progress-div").show();
            $("#progress-div").html("0%");

            // Set title to username/*
            document.title = $("#username").val() + "/* - " + document.title;

            getOverview();

        } else {
            $("#progress-div").show();
            $("#progress-div").html("0%");

            // Set title to username/repository
            document.title = $("#username").val() + "/" + $("#repository").val() + " - " + document.title;

            getSingleRepo();

            $("#title").show();
            $("#top-pagination").pagination({
                pages: 1,
                currentPage: page,
                displayedPages: 3,
                edges: 1,
                cssStyle: 'light-theme',
                onPageClick: function (pageNumber) {
                    PageClick(pageNumber);
                }
            });
            $("#bottom-pagination").pagination({
                pages: 1,
                currentPage: page,
                displayedPages: 3,
                edges: 1,
                cssStyle: 'light-theme',
                onPageClick: function (pageNumber) {
                    PageClick(pageNumber);
                }
            });
            $("#top-perpage").pagination({
                labelMap: ["5", "10", "25", "50"],
                pages: 4,
                currentPage: perPageIndex,
                hrefTextPrefix: "#perPage-",
                prevText: '',
                nextText: '',
                cssStyle: 'compact-theme',
                onPageClick: function (_pageNumber) {
                    perPageClick(_pageNumber, "#bottom-perpage");
                }
            });
            $("#bottom-perpage").pagination({
                labelMap: ["5", "10", "25", "50"],
                pages: 4,
                currentPage: perPageIndex,
                hrefTextPrefix: "#perPage-",
                prevText: '',
                nextText: '',
                cssStyle: 'compact-theme',
                onPageClick: function (_pageNumber) {
                    perPageClick(_pageNumber, "#top-perpage");
                }
            });
        }
    } else {
        $("#username").focus();
    }
});
