import $ from 'jquery';
import * as d3 from 'd3';

import './app.element.css';
import { BrowserStats } from './browser-stats';

export class AppElement extends HTMLElement {
    public static observedAttributes = [];

    connectedCallback() {
        this.render();

        let browserStats;

        const bindFeatureDataList = function (features, required, sumCurrent) {
            const _supportedByCurrent = browserStats.browsersByFeature(
                required,
                ['y', 'y x', 'a', 'a x']
            );

            const featureListElement = document.getElementById('featureList');
            const featuresElement = document.getElementById('features');
            const freeListElement = document.getElementById('free');
            featureListElement.innerHTML = '';
            freeListElement.innerHTML = '';
            featuresElement.innerHTML = '';

            const featuresDataListFragment = document.createElement('template');
            const freeFeatureFragment = document.createElement('template');
            const featuresFragment = document.createElement('template');

            let featuresFragmentHTML = '';
            let featuresListFragmentHTML = '';
            let freeFeatureFragmentHTML = '';

            featuresFragment.innerHTML = '';
            featuresDataListFragment.innerHTML = '';
            freeFeatureFragment.innerHTML = '';

            for (const [featureName, feature] of features) {
                // This individual feature + other required features.
                const supportedBy = browserStats.browsersByFeature(
                    required.concat(featureName),
                    ['y', 'y x', 'a', 'a x']
                );
                const sum = supportedBy.reduce(
                    (memo, num) => memo + num.share,
                    0
                );
                const difference = (sum / sumCurrent) * 100;
                const title = feature.title;

                featuresListFragmentHTML += `<option value='${featureName}'>${title} - ${difference.toFixed(
                    2
                )}%</option>`;
                if (Math.round(100 - difference) === 0) {
                    freeFeatureFragmentHTML += `<li data-share='${sum}'>
          <input 
          data-difference='${difference}' 
          data-feature='${featureName}' 
          type='checkbox' id='${featureName}freechk'/>
          <label for='${featureName}freechk' style='background-color: hsla(${Math.round(
                        difference
                    )}, 100%, 42%, 1)'>${title} <span class=featpct></span></label>`;
                }

                featuresFragmentHTML += `<li><input data-feature='${featureName}' type='checkbox' id='${featureName}chk'/><label for='${featureName}chk' style='background-color: hsla(${Math.round(
                    difference
                )}, 100%, 42%, 1)'>${title} <span class=featpct>(${difference.toFixed(
                    0
                )}%)</span></label>`;
            }

            featuresFragment.innerHTML = featuresFragmentHTML;
            featuresDataListFragment.innerHTML = featuresListFragmentHTML;
            freeFeatureFragment.innerHTML = freeFeatureFragmentHTML;

            featuresElement.appendChild(featuresFragment.content);
            featureListElement.appendChild(featuresDataListFragment.content);
            freeListElement.appendChild(freeFeatureFragment.content);
        };

        $(function () {
            let deviceType = 'all';
            deviceType =
                window.location.host.indexOf('onmobile') == 0
                    ? 'mobile'
                    : deviceType;
            deviceType =
                window.location.host.indexOf('ondesktop') == 0
                    ? 'desktop'
                    : deviceType;
            $('#charts').addClass(deviceType);
            $('#usertype').text(deviceType);

            BrowserStats.load(deviceType).then(browsers => {
                browserStats = browsers;
                const features = Object.entries(browsers.features);
                features.sort(([key1], [key2]) => key1.localeCompare(key2));
                const updateShare = function (requiredFeatures) {
                    if (!!requiredFeatures === false) return;
                    const statsForAllFeatures = browserStats.browsersByFeature(
                        [],
                        ['y', 'y x', 'a', 'a x']
                    );
                    const supportedBy = browserStats.browsersByFeature(
                        requiredFeatures,
                        ['y', 'y x', 'a', 'a x']
                    );

                    const sum = supportedBy.reduce(
                        (memo, num) => memo + num.share,
                        0
                    );
                    const totalSum = statsForAllFeatures.reduce(
                        (memo, num) => memo + num.share,
                        0
                    );

                    $('#share')
                        .css({
                            color:
                                'hsla(' +
                                Math.round(
                                    (90 / 100) * ((sum / totalSum) * 100)
                                ) +
                                ', 100%, 42%, 1)',
                        })
                        .text(((sum / totalSum) * 100).toFixed(2));
                    $('#userShare').text(((sum / totalSum) * 100).toFixed(2));
                    $('#unuseableShare')
                        .css({
                            color:
                                'hsla(' +
                                Math.round(
                                    100 - (90 / 100) * ((sum / totalSum) * 100)
                                ) +
                                ', 100%, 42%, 1)',
                        })
                        .text((100 - (sum / totalSum) * 100).toFixed(2));

                    bindFeatureDataList(features, requiredFeatures, sum);
                    // Version numbers aren't that interesting here.
                    drawTable(
                        '#totalShare',
                        ['name', 'since', 'share'],
                        supportedBy
                    );

                    const mobileDesktopSplitData = browserStats.typesByFeature(
                        requiredFeatures,
                        ['y', 'y x', 'a', 'a x']
                    );
                    drawTable(
                        '#mobileDesktopSplit',
                        ['device', 'share'],
                        mobileDesktopSplitData
                    );
                };

                const updateHeader = function (requiredFeatures) {
                    if (
                        !!requiredFeatures === false ||
                        requiredFeatures.length === 0
                    ) {
                        $('#usedFeatures ul').html('Nothing special');
                        $('#usedFeaturesSpan').html('Nothing special');
                    } else {
                        $('#usedFeatures ul').html(
                            requiredFeatures
                                .map(i => {
                                    const item = browserStats.getFeature(i);
                                    return (
                                        "<li><input data-feature='" +
                                        item.id +
                                        "' type='checkbox' id='" +
                                        item.id +
                                        "usedchk'/><label for='" +
                                        item.id +
                                        "usedchk'>" +
                                        item.title +
                                        '</label>'
                                    );
                                })
                                .join('')
                        );

                        $('#usedFeaturesSpan').html(
                            requiredFeatures
                                .map(i => {
                                    const item = browserStats.getFeature(i);
                                    return item.title;
                                })
                                .join(', ')
                        );
                    }
                };

                $('input[type=checkbox]').on('change', function () {
                    const featureName = $(this).data('feature');
                    const checked = $(this).prop('checked');

                    // toggle all the other checkboxes for the same feature
                    $("input[data-feature='" + featureName + "']").prop(
                        'checked',
                        checked ? 'checked' : false
                    );

                    const featureList = [
                        ...new Set(
                            Array.from($('input:checked')).map(val =>
                                $(val).data('feature')
                            )
                        ),
                    ];
                    window.location.hash = featureList.join(',');
                });

                window.addEventListener('hashchange', function () {
                    const urlFeats = getFeatureArrayFromString(
                        window.location.hash.substring(1)
                    );
                    updateShare(urlFeats);
                    updateHeader(urlFeats);
                    $(
                        urlFeats
                            .map(f => "input[data-feature='" + f + "']")
                            .join()
                    ).prop('checked', 'checked');
                });

                const urlFeats = getFeatureArrayFromString(
                    window.location.hash.substring(1)
                );
                updateShare(urlFeats);
                updateHeader(urlFeats);
                $(
                    urlFeats.map(f => "input[data-feature='" + f + "']").join()
                ).prop('checked', 'checked');

                $('#search').on('change', function () {
                    if (this.value === '') return;
                    const urlFeats = getFeatureArrayFromString(
                        window.location.hash.substring(1)
                    );
                    urlFeats.push(this.value);
                    $(
                        urlFeats
                            .map(f => "input[data-feature='" + f + "']")
                            .join()
                    ).prop('checked', 'checked');
                    window.location.hash = $('input:checked')
                        .map(function (val, i) {
                            return $(i).data('feature');
                        })
                        .toArray()
                        .join(',');
                    this.value = '';
                });
            });
        });

        const getFeatureArrayFromString = function (str) {
            const feats = str.split(',');
            if (feats.length == 1 && feats[0] === '') return [];
            return feats;
        };

        const drawTable = function (element, columns, data) {
            const table = d3.select(element).html('').append('table'),
                thead = table.append('thead'),
                tbody = table.append('tbody');

            thead
                .append('tr')
                .selectAll('th')
                .data(columns)
                .enter()
                .append('th')
                .text(function (col) {
                    return col;
                });

            const rows = tbody.selectAll('tr').data(data).enter().append('tr');

            const _cells = rows
                .selectAll('tr')
                .data(function (row) {
                    return columns.map(function (col) {
                        if (col === 'share')
                            return {
                                column: col,
                                value: row[col].toFixed(3) + '%',
                            };
                        else if (col === 'device')
                            return {
                                column: col,
                                value:
                                    "<a href='https://on" +
                                    row['name'] +
                                    ".iwanttouse.com/'>" +
                                    row['name'] +
                                    '</a>',
                            };
                        else return { column: col, value: row[col] };
                    });
                })
                .enter()
                .append('td')
                .classed('versions', function (d) {
                    return d.column === 'versions';
                })
                .html(function (d) {
                    return d.value;
                });
        };
    }

    render() {
        this.innerHTML = `
    <div id="result" class="all">
    <section class="hero-unit">
      <h2 id="usedFeatures">If you make a page that requires: <ul></ul>
      </h2>
      <h1><span id="share">100</span>% of <span id="usertype">all</span> web users can use your site</h1>
      <h2><span id="unuseableShare">0</span>% will not be able to use your site without polyfills</h2>

      <div id="addfeatures">
        <input id="search" type="search" list="featureList" placeholder="Add a feature">
        <datalist id="featureList"> </datalist>
      </div>
      <br />
      <p stlye="clear:both;">Powered by data from <a href="http://caniuse.com/">caniuse.com</a></p>
    </section>

    <section>
      <div id="charts">
        <h2 class="all">Device type split</h2>
        <p class="all">The ratio of the web that can use your chosen features split by Desktop and Mobile</p>
        <div id="mobileDesktopSplit" class="all">
          <p>Choose some features.</p>
        </div>
        <div id="mobileDesktopSplitChart" class="all">
        </div>
        <h2>Browser share</h2>
        <p>The ratio of the entire web that can use your selected features aggregated by browser</p>
        <div id="totalShare">
          <p>Choose some features.</p>
        </div>
        <div id="totalShareChart">
        </div>
      </div>
    </section>

    <section>
      <h3>Features you can use</h3>
      <p>When considering the <span id="userShare"></span>% of people who use a browser that can handle <codee id="usedFeaturesSpan"></code>; 
        their browsers also support the following features without polyfills:</p>
      <ul id="free"></ul>
    </section>
  </div>
  <h2>All Browser Features</h2>
  <p>Select a range of Browser features that you would like to use in your app</p>
  <ul id="features"></ul>
      `;
    }
}

customElements.define('no-code-root', AppElement);
