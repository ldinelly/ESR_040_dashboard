//# dc.js Getting Started and How-To Guide
'use strict';

/* jshint globalstrict: true */
/* global dc,d3,crossfilter */

// ### Create Chart Objects

// Create chart objects associated with the container elements identified by the css selector.
// Note: It is often a good idea to have these objects accessible at the global scope so that they can be modified or
// filtered by other page controls.
var volumeChart = dc.barChart('#monthly-volume-chart');
var nasdaqCount = dc.dataCount('.dc-data-count');
var nasdaqTable = dc.dataTable('.dc-data-table');





var fluctuationChart = dc.barChart('#fluctuation-chart');
var moveChart = dc.lineChart('#monthly-move-chart');



// ### Anchor Div for Charts
/*
// A div anchor that can be identified by id
    <div id='your-chart'></div>
// Title or anything you want to add above the chart
    <div id='chart'><span>Days by Gain or Loss</span></div>
// ##### .turnOnControls()

// If a link with css class `reset` is present then the chart
// will automatically hide/show it based on whether there is a filter
// set on the chart (e.g. slice selection for pie chart and brush
// selection for bar chart). Enable this with `chart.turnOnControls(true)`

// By default, dc.js >=2.1 uses `display: none` to control whether or not chart
// controls are shown. To use `visibility: hidden` to hide/show controls
// without disrupting the layout, set `chart.controlsUseVisibility(true)`.

    <div id='chart'>
       <a class='reset'
          href='javascript:myChart.filterAll();dc.redrawAll();'
          style='visibility: hidden;'>reset</a>
    </div>
// dc.js will also automatically inject the current filter value into
// any html element with its css class set to `filter`
    <div id='chart'>
        <span class='reset' style='visibility: hidden;'>
          Current filter: <span class='filter'></span>
        </span>
    </div>
*/

//### Load your data

//Data can be loaded through regular means with your
//favorite javascript library
//
//```javascript
//d3.csv('data.csv').then(function(data) {...});
//d3.json('data.json').then(function(data) {...});
//jQuery.getJson('data.json', function(data){...});
//```
d3.csv('ndx.csv').then(function (data) {
	// Since its a csv file we need to format the data a bit.
	var dateFormatSpecifier = '%m/%d/%Y';
	var dateFormat = d3.timeFormat(dateFormatSpecifier);
	var dateFormatParser = d3.timeParse(dateFormatSpecifier);
	var numberFormat = d3.format('.2f');

	data.forEach(function (d) {
		d.dd = dateFormatParser(d.date);
		d.month = d3.timeMonth(d.dd); // pre-calculate month for better performance
		d.close = +d.close; // coerce to number
		d.open = +d.open;
	});

	//### Create Crossfilter Dimensions and Groups

	//See the [crossfilter API](https://github.com/square/crossfilter/wiki/API-Reference) for reference.
	var ndx = crossfilter(data);
	var all = ndx.groupAll();

	// Dimension by year
	var yearlyDimension = ndx.dimension(function (d) {
		return d3.timeYear(d.dd).getFullYear();
	});
	// Maintain running tallies by year as filters are applied or removed
	var yearlyPerformanceGroup = yearlyDimension.group().reduce(
		/* callback for when data is added to the current filter results */
		function (p, v) {
			++p.count;
			p.absGain += v.close - v.open;
			p.fluctuation += Math.abs(v.close - v.open);
			p.sumIndex += (v.open + v.close) / 2;
			p.avgIndex = p.sumIndex / p.count;
			p.percentageGain = p.avgIndex ? (p.absGain / p.avgIndex) * 100 : 0;
			p.fluctuationPercentage = p.avgIndex ? (p.fluctuation / p.avgIndex) * 100 : 0;
			return p;
		},
		/* callback for when data is removed from the current filter results */
		function (p, v) {
			--p.count;
			p.absGain -= v.close - v.open;
			p.fluctuation -= Math.abs(v.close - v.open);
			p.sumIndex -= (v.open + v.close) / 2;
			p.avgIndex = p.count ? p.sumIndex / p.count : 0;
			p.percentageGain = p.avgIndex ? (p.absGain / p.avgIndex) * 100 : 0;
			p.fluctuationPercentage = p.avgIndex ? (p.fluctuation / p.avgIndex) * 100 : 0;
			return p;
		},
		/* initialize p */
		function () {
			return {
				count: 0,
				absGain: 0,
				fluctuation: 0,
				fluctuationPercentage: 0,
				sumIndex: 0,
				avgIndex: 0,
				percentageGain: 0
			};
		}
	);

	// Dimension by full date
	var dateDimension = ndx.dimension(function (d) {
		return d.dd;
	});

	// Dimension by month
	var moveMonths = ndx.dimension(function (d) {
		return d.month;
	});
	// Group by total movement within month
	var monthlyMoveGroup = moveMonths.group().reduceSum(function (d) {
		return Math.abs(d.close - d.open);
	});
	// Group by total volume within move, and scale down result
	var volumeByMonthGroup = moveMonths.group().reduceSum(function (d) {
		return d.volume / 500000;
	});
	var indexAvgByMonthGroup = moveMonths.group().reduce(
		function (p, v) {
			++p.days;
			p.total += (v.open + v.close) / 2;
			p.avg = Math.round(p.total / p.days);
			return p;
		},
		function (p, v) {
			--p.days;
			p.total -= (v.open + v.close) / 2;
			p.avg = p.days ? Math.round(p.total / p.days) : 0;
			return p;
		},
		function () {
			return {days: 0, total: 0, avg: 0};
		}
	);

	// Create categorical dimension
	var gainOrLoss = ndx.dimension(function (d) {
		return d.open > d.close ? 'Loss' : 'Gain';
	});
	// Produce counts records in the dimension
	var gainOrLossGroup = gainOrLoss.group();

	// Determine a histogram of percent changes
	var fluctuation = ndx.dimension(function (d) {
		return Math.round((d.close - d.open) / d.open * 100);
	});
	var fluctuationGroup = fluctuation.group();

	// Summarize volume by quarter
	var quarter = ndx.dimension(function (d) {
		var month = d.dd.getMonth();
		if (month <= 2) {
			return 'Q1';
		} else if (month > 2 && month <= 5) {
			return 'Q2';
		} else if (month > 5 && month <= 8) {
			return 'Q3';
		} else {
			return 'Q4';
		}
	});
	var quarterGroup = quarter.group().reduceSum(function (d) {
		return d.volume;
	});

	// Counts per weekday
	var dayOfWeek = ndx.dimension(function (d) {
		var day = d.dd.getDay();
		var name = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		return day + '.' + name[day];
	});
	var dayOfWeekGroup = dayOfWeek.group();

	//### Define Chart Attributes
	// Define chart attributes using fluent methods. See the
	// [dc.js API Reference](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md) for more information
	//


	//#### Bar Chart

	// Create a bar chart and use the given css selector as anchor. You can also specify
	// an optional chart group for this chart to be scoped within. When a chart belongs
	// to a specific group then any interaction with such chart will only trigger redraw
	// on other charts within the same chart group.
	// <br>API: [Bar Chart](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#bar-chart)
	fluctuationChart /* dc.barChart('#volume-month-chart', 'chartGroup') */
		.width(420)
		.height(180)
		.margins({top: 10, right: 50, bottom: 30, left: 40})
		.dimension(fluctuation)
		.group(fluctuationGroup)
		.elasticY(true)
		// (_optional_) whether bar should be center to its x value. Not needed for ordinal chart, `default=false`
		.centerBar(true)
		// (_optional_) set gap between bars manually in px, `default=2`
		.gap(1)
		// (_optional_) set filter brush rounding
		.round(dc.round.floor)
		.alwaysUseRounding(true)
		.x(d3.scaleLinear().domain([-25, 25]))
		.renderHorizontalGridLines(true)
		// Customize the filter displayed in the control span
		.filterPrinter(function (filters) {
			var filter = filters[0], s = '';
			s += numberFormat(filter[0]) + '% -> ' + numberFormat(filter[1]) + '%';
			return s;
		});

	// Customize axes
	fluctuationChart.xAxis().tickFormat(
		function (v) { return v + '%'; });
	fluctuationChart.yAxis().ticks(5);

	//#### Stacked Area Chart

	//Specify an area chart by using a line chart with `.renderArea(true)`.
	// <br>API: [Stack Mixin](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#stack-mixin),
	// [Line Chart](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#line-chart)
	moveChart /* dc.lineChart('#monthly-move-chart', 'chartGroup') */
		.renderArea(true)
		.width(990)
		.height(200)
		.transitionDuration(1000)
		.margins({top: 30, right: 50, bottom: 25, left: 40})
		.dimension(moveMonths)
		.mouseZoomable(true)
		// Specify a "range chart" to link its brush extent with the zoom of the current "focus chart".
		.rangeChart(volumeChart)
		.x(d3.scaleTime().domain([new Date(2018, 0, 1), new Date(2019, 11, 31)]))
		.round(d3.timeMonth.round)
		.xUnits(d3.timeMonths)
		.elasticY(true)
		.renderHorizontalGridLines(true)
		//##### Legend

		// Position the legend relative to the chart origin and specify items' height and separation.
		.legend(dc.legend().x(800).y(10).itemHeight(13).gap(5))
		.brushOn(false)
		// Add the base layer of the stack with group. The second parameter specifies a series name for use in the
		// legend.
		// The `.valueAccessor` will be used for the base layer
		.group(indexAvgByMonthGroup, 'Monthly Index Average')
		.valueAccessor(function (d) {
			return d.value.avg;
		})
		// Stack additional layers with `.stack`. The first paramenter is a new group.
		// The second parameter is the series name. The third is a value accessor.
		.stack(monthlyMoveGroup, 'Monthly Index Move', function (d) {
			return d.value;
		})
		// Title can be called by any stack layer.
		.title(function (d) {
			var value = d.value.avg ? d.value.avg : d.value;
			if (isNaN(value)) {
				value = 0;
			}
			return dateFormat(d.key) + '\n' + numberFormat(value);
		});

	//#### Range Chart

	// Since this bar chart is specified as "range chart" for the area chart, its brush extent
	// will always match the zoom of the area chart.
	volumeChart.width(990) /* dc.barChart('#monthly-volume-chart', 'chartGroup'); */
		.height(40)
		.margins({top: 0, right: 50, bottom: 20, left: 40})
		.dimension(moveMonths)
		.group(volumeByMonthGroup)
		.centerBar(true)
		.gap(1)
		.x(d3.scaleTime().domain([new Date(2018, 0, 1), new Date(2019, 11, 31)]))
		.round(d3.timeMonth.round)
		.alwaysUseRounding(true)
		.xUnits(d3.timeMonths);

	//#### Data Count

	// Create a data count widget and use the given css selector as anchor. You can also specify
	// an optional chart group for this chart to be scoped within. When a chart belongs
	// to a specific group then any interaction with such chart will only trigger redraw
	// on other charts within the same chart group.
	// <br>API: [Data Count Widget](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#data-count-widget)
	//
	//```html
	//<div class='dc-data-count'>
	//  <span class='filter-count'></span>
	//  selected out of <span class='total-count'></span> records.
	//</div>
	//```

	nasdaqCount /* dc.dataCount('.dc-data-count', 'chartGroup'); */
		.crossfilter(ndx)
		.groupAll(all)
		// (_optional_) `.html` sets different html when some records or all records are selected.
		// `.html` replaces everything in the anchor with the html given using the following function.
		// `%filter-count` and `%total-count` are replaced with the values obtained.
		.html({
			some: '<strong>%filter-count</strong> selected out of <strong>%total-count</strong> records' +
				' | <a href=\'javascript:dc.filterAll(); dc.renderAll();\'>Reset All</a>',
			all: 'All records selected. Please click on the graph to apply filters.'
		});

	//#### Data Table

	// Create a data table widget and use the given css selector as anchor. You can also specify
	// an optional chart group for this chart to be scoped within. When a chart belongs
	// to a specific group then any interaction with such chart will only trigger redraw
	// on other charts within the same chart group.
	// <br>API: [Data Table Widget](https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#data-table-widget)
	//
	// You can statically define the headers like in
	//
	// ```html
	//    <!-- anchor div for data table -->
	//    <div id='data-table'>
	//       <!-- create a custom header -->
	//       <div class='header'>
	//           <span>Date</span>
	//           <span>Open</span>
	//           <span>Close</span>
	//           <span>Change</span>
	//           <span>Volume</span>
	//       </div>
	//       <!-- data rows will filled in here -->
	//    </div>
	// ```
	// or do it programmatically using `.columns()`.

	nasdaqTable /* dc.dataTable('.dc-data-table', 'chartGroup') */
		.dimension(dateDimension)
		// Specify a section function to nest rows of the table
		.section(function (d) {
			var format = d3.format('02d');
			return d.dd.getFullYear() + '/' + format((d.dd.getMonth() + 1));
		})
		// (_optional_) max number of records to be shown, `default = 25`
		.size(10)
		// There are several ways to specify the columns; see the data-table documentation.
		// This code demonstrates generating the column header automatically based on the columns.
		.columns([
			// Use the `d.date` field; capitalized automatically
			'date',
			// Use `d.open`, `d.close`
			'ord',
			'atraso',
			{
				// Specify a custom format for column 'Change' by using a label with a function.
				label: 'Change',
				format: function (d) {
					return numberFormat(d.close - d.open);
				}
			},
			// Use `d.volume`
			'volume'
		])

		// (_optional_) sort using the given field, `default = function(d){return d;}`
		.sortBy(function (d) {
			return d.dd;
		})
		// (_optional_) sort order, `default = d3.ascending`
		.order(d3.ascending)
		// (_optional_) custom renderlet to post-process chart using [D3](http://d3js.org)
		.on('renderlet', function (table) {
			table.selectAll('.dc-table-group').classed('info', true);
		});

	/*
	//#### Geo Choropleth Chart

	//Create a choropleth chart and use the given css selector as anchor. You can also specify
	//an optional chart group for this chart to be scoped within. When a chart belongs
	//to a specific group then any interaction with such chart will only trigger redraw
	//on other charts within the same chart group.
	// <br>API: [Geo Chroropleth Chart][choro]
	// [choro]: https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#geo-choropleth-chart
	dc.geoChoroplethChart('#us-chart')
		 // (_optional_) define chart width, default 200
		.width(990)
		// (optional) define chart height, default 200
		.height(500)
		// (optional) define chart transition duration, default 1000
		.transitionDuration(1000)
		// set crossfilter dimension, dimension key should match the name retrieved in geojson layer
		.dimension(states)
		// set crossfilter group
		.group(stateRaisedSum)
		// (_optional_) define color function or array for bubbles
		.colors(['#ccc', '#E2F2FF','#C4E4FF','#9ED2FF','#81C5FF','#6BBAFF','#51AEFF','#36A2FF','#1E96FF','#0089FF',
			'#0061B5'])
		// (_optional_) define color domain to match your data domain if you want to bind data or color
		.colorDomain([-5, 200])
		// (_optional_) define color value accessor
		.colorAccessor(function(d, i){return d.value;})
		// Project the given geojson. You can call this function multiple times with different geojson feed to generate
		// multiple layers of geo paths.
		//
		// * 1st param - geojson data
		// * 2nd param - name of the layer which will be used to generate css class
		// * 3rd param - (_optional_) a function used to generate key for geo path, it should match the dimension key
		// in order for the coloring to work properly
		.overlayGeoJson(statesJson.features, 'state', function(d) {
			return d.properties.name;
		})
		// (_optional_) closure to generate title for path, `default = d.key + ': ' + d.value`
		.title(function(d) {
			return 'State: ' + d.key + '\nTotal Amount Raised: ' + numberFormat(d.value ? d.value : 0) + 'M';
		});

		//#### Bubble Overlay Chart

		// Create a overlay bubble chart and use the given css selector as anchor. You can also specify
		// an optional chart group for this chart to be scoped within. When a chart belongs
		// to a specific group then any interaction with the chart will only trigger redraw
		// on charts within the same chart group.
		// <br>API: [Bubble Overlay Chart][bubble]
		// [bubble]: https://github.com/dc-js/dc.js/blob/master/web/docs/api-latest.md#bubble-overlay-chart
		dc.bubbleOverlay('#bubble-overlay', 'chartGroup')
			// The bubble overlay chart does not generate its own svg element but rather reuses an existing
			// svg to generate its overlay layer
			.svg(d3.select('#bubble-overlay svg'))
			// (_optional_) define chart width, `default = 200`
			.width(990)
			// (_optional_) define chart height, `default = 200`
			.height(500)
			// (_optional_) define chart transition duration, `default = 1000`
			.transitionDuration(1000)
			// Set crossfilter dimension, dimension key should match the name retrieved in geo json layer
			.dimension(states)
			// Set crossfilter group
			.group(stateRaisedSum)
			// Closure used to retrieve x value from multi-value group
			.keyAccessor(function(p) {return p.value.absGain;})
			// Closure used to retrieve y value from multi-value group
			.valueAccessor(function(p) {return p.value.percentageGain;})
			// (_optional_) define color function or array for bubbles
			.colors(['#ccc', '#E2F2FF','#C4E4FF','#9ED2FF','#81C5FF','#6BBAFF','#51AEFF','#36A2FF','#1E96FF','#0089FF',
				'#0061B5'])
			// (_optional_) define color domain to match your data domain if you want to bind data or color
			.colorDomain([-5, 200])
			// (_optional_) define color value accessor
			.colorAccessor(function(d, i){return d.value;})
			// Closure used to retrieve radius value from multi-value group
			.radiusValueAccessor(function(p) {return p.value.fluctuationPercentage;})
			// set radius scale
			.r(d3.scaleLinear().domain([0, 3]))
			// (_optional_) whether chart should render labels, `default = true`
			.renderLabel(true)
			// (_optional_) closure to generate label per bubble, `default = group.key`
			.label(function(p) {return p.key.getFullYear();})
			// (_optional_) whether chart should render titles, `default = false`
			.renderTitle(true)
			// (_optional_) closure to generate title per bubble, `default = d.key + ': ' + d.value`
			.title(function(d) {
				return 'Title: ' + d.key;
			})
			// add data point to its layer dimension key that matches point name: it will be used to
			// generate a bubble. Multiple data points can be added to the bubble overlay to generate
			// multiple bubbles.
			.point('California', 100, 120)
			.point('Colorado', 300, 120)
			// (_optional_) setting debug flag to true will generate a transparent layer on top of
			// bubble overlay which can be used to obtain relative `x`,`y` coordinate for specific
			// data point, `default = false`
			.debug(true);
	*/

	//#### Rendering

	//simply call `.renderAll()` to render all charts on the page
	dc.renderAll();
	/*
	// Or you can render charts belonging to a specific chart group
	dc.renderAll('group');
	// Once rendered you can call `.redrawAll()` to update charts incrementally when the data
	// changes, without re-rendering everything
	dc.redrawAll();
	// Or you can choose to redraw only those charts associated with a specific chart group
	dc.redrawAll('group');
	*/

});

//#### Versions

//Determine the current version of dc with `dc.version`
d3.selectAll('#version').text(dc.version);

// Determine latest stable version in the repo via Github API
d3.json('https://api.github.com/repos/dc-js/dc.js/releases/latest').then(function (latestRelease) {
	/*jshint camelcase: false */
	/* jscs:disable */
	d3.selectAll('#latest').text(latestRelease.tag_name);
});
