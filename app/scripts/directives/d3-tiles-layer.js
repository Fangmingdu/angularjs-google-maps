/**
 * extend d3.geo.tile
 *
 * */
d3.geo.tile = function() {
    var zoom = 10,
        sw = [0,0], //lat,lng
        ne = [0,0]; //lat,lng

    function long2tile(lon,zoom) {
        return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
    }

    function lat2tile(lat,zoom)  {
        return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
    }

    function tile() {
        var k = 256,
            sw_origin = [long2tile(sw.lng(),zoom), lat2tile(sw.lat(),zoom)],
            ne_origin = [long2tile(ne.lng(),zoom), lat2tile(ne.lat(),zoom)],
            tiles = [],
            cols = d3.range(sw_origin[0], ne_origin[0]+1),
            rows = d3.range(ne_origin[1], sw_origin[1]+1);

        rows.forEach(function(y) {
            cols.forEach(function(x) {
                tiles.push([x, y, zoom]);
            });
        });

        tiles.scale = k;
        tiles.translate = [sw_origin[0],ne_origin[1]];

        return tiles;
    }

    tile.zoom = function(_) {
        if (!arguments.length) return zoom;
        zoom = _;
        return tile;
    };

    tile.sw = function(_) {
        if (!arguments.length) return sw;
        sw = _;
        return tile;
    };

    tile.ne = function(_) {
        if (!arguments.length) return ne;
        ne = _;
        return tile;
    };

    return tile;
};
/**
 * @ngdoc directive
 * @name d3-tiles-layer
 * @requires Attr2Options
 * @description
 *   Requires:  map directive
 *   Restrict To:  Element
 *
 * @example
 * Example:
 *
 *   <map zoom="11" center="[41.875696,-87.624207]">
 *     <d3-tiles-layer></d3-tiles-layer>
 *   </map>
 */
/*jshint -W089*/
ngMap.directive('d3TilesLayer', ['Attr2Options', '$window', '$templateCache', '$http',  function(Attr2Options, $window, $templateCache, $http) {
    var parser = Attr2Options;

    TileOverlay.prototype = new google.maps.OverlayView();
    /** @constructor */
    function TileOverlay(controller,options,currentScope) {

        // Initialize all properties.
        this.controller = controller;
        this.id = options.id;
        this.options = options;

        var scope = currentScope;
        this.getScope = function(){
            return scope;
        };

        // Define translate property
        this.translate_x = 0;
        this.translate_y = 0;
    }

    /**
     * onAdd is called when the map's panes are ready and the overlay has been
     * added to the map.
     */
    TileOverlay.prototype.onAdd = function() {
        // svg layer
        var overlaysvg = d3.select(this.getPanes().overlayLayer)
            .append("svg")
            .style("width", $window.innerWidth + "px")
            .style("height", $window.innerHeight + "px")
            .style('position','absolute');

        //tooltip div
        var tooltip = d3.select(this.getPanes().floatPane).append("div").attr("class","axio-map-tooltip");

        //current private variable
        var options = this.options,
            requestUrl = options.tileoptions.urls[0].url,
            overlayProjection = this.getProjection(),
            markers_map = {},
            tooltipContent = $templateCache.get(options.markeroptions.tooltiptemplate),
            sizeMap = {10:0.1,11:0.15,12:0.25,13:0.35,14:0.5,15:0.75,16:1,17:1,18:1,19:1};

        var scope = this.getScope();

        //d3 related variable
        var tile = d3.geo.tile(),  // geo tile object
            tilePath = d3.geo.path().projection(googleMapProjection); //d3 path function

        /**
         * Turn the overlay projection into a d3 projection
         *
         * */
        function googleMapProjection(coordinates) {
            var googleCoordinates = new google.maps.LatLng(coordinates[1], coordinates[0]);
            var pixelCoordinates = overlayProjection.fromLatLngToDivPixel(googleCoordinates);
            return [pixelCoordinates.x, pixelCoordinates.y];
        };

        /**
         * clear all markers in map
         *
         * */
        function clearMarkers(map,groupId){
            if(Object.keys(markers_map).length > 0){
                if(groupId){
                    if(groupId in markers_map)
                    {
                        markers_map[groupId].forEach(function (d) {
                            var marker = map.markers[d];
                            if(marker){
                                delete map.markers[d];
                                marker.setMap(null);
                            }
                        });
                    }
                    delete markers_map[groupId];
                }
                else{
                    for(var groupId in markers_map)
                    {
                        markers_map[groupId].forEach(function (d) {
                            var marker = map.markers[d];
                            if(marker){
                                delete map.markers[d];
                                marker.setMap(null);
                            }
                        });
                    }

                    //empty map
                    markers_map = {};
                }
            }
        }
        /**
         *
         * */
        function getMarkerIcon(map,url){
            var width = options.markeroptions.iconwidth,
                height = options.markeroptions.iconheight;

            var image = {
                url: url,
                // This marker is 20 pixels wide by 32 pixels tall.  32, 37
                scaledSize: new google.maps.Size(width*sizeMap[map.getZoom()], height*sizeMap[map.getZoom()])
            };

            return image;
        }

        /**
         * get tooltip from data
         *
         * */
        function getTooltipContent(tooltipHtml,property){

            var submarketGradeColor = "color:red";
            if(property.gradeinsubmarket.indexOf('A') !== -1){
                submarketGradeColor = "color:gold";
            }
            else if(property.gradeinsubmarket.indexOf('B') !== -1){
                submarketGradeColor = "color:green";
            }

            var ergImg = property.erg >=0 ?  options.markeroptions.img.arrowup : options.markeroptions.img.arrowdown;
            var occchangeImg = property.occchange >=0 ? options.markeroptions.img.arrowup : options.markeroptions.img.arrowdown;

            var tooltip = tooltipHtml.replace(/{{propertyid}}/g, property.propertyid)
                .replace(/{{name}}/g,property.name)
                .replace(/{{address}}/g,property.address+" " +property.city+" "+ property.st)
                .replace(/{{rent}}/g, "$"+property.erent.toFixed(2))
                .replace(/{{erg}}/g,(property.erg*100).toFixed(2) + "%")
                .replace(/{{ergImg}}/g,ergImg)
                .replace(/{{occ}}/g,parseInt(property.occ*100) + "%")
                .replace(/{{occChange}}/g,(property.occchange*100).toFixed(2) + "%")
                .replace(/{{occImg}}/g,occchangeImg)
                .replace(/{{submarketGradeColor}}/g,submarketGradeColor)
                .replace(/{{submarketGrade}}/g,property.gradeinsubmarket);

            return tooltip;
        }

        /**
         *
         *
         * */
        function loadMarkers(map,controller,groupId,json){
            //clear circles
            markers_map[groupId] = [];

            var markeroptions = {},
                icon = getMarkerIcon(map,options.markeroptions.icon);

            json.features.filter(function(d){return d.geometry.type === 'Point';})
                .forEach(function(d){
                    markers_map[groupId].push(d.properties[options.markeroptions.id]);

                    markeroptions.position = new google.maps.LatLng(d.geometry.coordinates[1], d.geometry.coordinates[0]);
                    markeroptions.id = d.properties[options.markeroptions.id];
                    markeroptions.icon = icon;

                    //load data to markers object
                    d.properties.lat = d.geometry.coordinates[1];
                    d.properties.lng = d.geometry.coordinates[0];
                    markeroptions.data = d.properties;

                    var marker = new google.maps.Marker(markeroptions);

                    //add mouseover ifnowindow
                    var localTooltip = getTooltipContent(tooltipContent,d.properties);

                    google.maps.event.addListener(marker, 'mouseover', function(ev){

                        // no events emit for unvisible markers
                        if(marker.getOpacity() === 0){
                            return;
                        };

                        tooltip.html(localTooltip);
                        var ne = overlayProjection.fromLatLngToDivPixel(ev.latLng);
                        tooltip.style("left",(ne.x - options.markeroptions.tooltipWidth/2 + 5)+"px").style("top",(ne.y- options.markeroptions.tooltipHeight - options.markeroptions.iconheight * sizeMap[map.getZoom()] - 3)+"px");
                        tooltip.style("visibility","visible");
                    });

                    google.maps.event.addListener(marker, 'mouseout', function(ev){

                        // no events emit for unvisible markers
                        if(marker.getOpacity() === 0){
                            return;
                        };

                        tooltip.style("visibility","hidden");
                    });

                    google.maps.event.addListener(marker, 'click', function () {

                        // no events emit for unvisible markers
                        if(marker.getOpacity() === 0){
                            return;
                        };

                        scope.$emit('markerClicked',{data: d.properties,marker:marker});
                    });

                    google.maps.event.addListener(marker,'rightclick',function(e){

                        // no events emit for unvisible markers
                        if(marker.getOpacity() === 0){
                            return;
                        };

                        scope.$emit('markerRightClicked', {position: overlayProjection.fromLatLngToContainerPixel(e.latLng), latLng: e.latLng, id: d.properties[options.markeroptions.id] });
                    });

                    controller.addMarker(marker);

                });

            scope.$emit('markersLoaded', {});
        }

        /**
         * load feature from topoJson or geoJson
         * to svg
         * or google markers
         *
         * */
        function loadFeatures(map,controller,svg,json,groupId){

            if(json){
                //load polygons
                svg.selectAll("path")
                    .data(json.features.filter(function(d){return d.geometry.type === 'Polygon';}))
                    .enter().append("path")
                    .attr("class", function(d) { return d.properties.kind; })
                    .attr("d", tilePath);

                loadMarkers(map,controller,groupId,json);
            }
        };

        /**
         * re draw function
         * getting current tiles
         * request data
         * call load feature functions
         *
         * */
        function reDraw(map,controller,translate_x,translate_y){
            //current tiles
            var tiles = tile
                .zoom(map.getZoom())
                .sw(map.getBounds().getSouthWest())
                .ne(map.getBounds().getNorthEast())();

            //selection
            var image = overlaysvg.selectAll("g.tile").data(tiles, function(d) {
                return d;
            });

            //tiles exit and remove data
            image.exit().each(function(d) {

                if(this._xhr){
                    this._xhr.abort();
                }

                //
                var groupId = d[0] + '-' + d[1] + '-' + d[2];

                clearMarkers(map,groupId);

            }).remove();

            //
            image.enter().append("g").attr("class", "tile").each(function(d) {
                var group = d3.select(this);
                var url = requestUrl + d[2] + "/" + d[0] + "/" + d[1] + ".json";
                if(map.getZoom() >= options.tileoptions.urls[0].zoom){
                    this._xhr = d3.json(url, function(error, json) {
                        //load features
                        loadFeatures(map,controller,group,json,d[0]+'-'+d[1]+'-'+d[2]);
                    });
                }
            });

            image.attr("transform", "translate(" + translate_x + "," + translate_y + ")");
        }

        TileOverlay.prototype.draw = function() {
            //re draw tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y);
        };

        TileOverlay.prototype.dragged = function() {
            //get current moved x y coordinates
            this.translate_x = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getSouthWest()).x);
            this.translate_y = -Math.round(this.getProjection().fromLatLngToDivPixel(this.map.getBounds().getNorthEast()).y);

            //move svg element
            overlaysvg.style('left', -this.translate_x).style('top', -this.translate_y);

            //re draw all tiles
            reDraw(this.map,this.controller,this.translate_x,this.translate_y);

        };

        TileOverlay.prototype.showTooltip = function(marker,map){
            //get marker position, data and refresh tooltip

            var localTooltip = getTooltipContent(tooltipContent,marker.data);

            tooltip.html(localTooltip);
            var ne = overlayProjection.fromLatLngToDivPixel(marker.getPosition());
            tooltip.style("left",(ne.x - options.markeroptions.tooltipWidth/2 + 5)+"px").style("top",(ne.y- options.markeroptions.tooltipHeight - options.markeroptions.iconheight * sizeMap[map.getZoom()] - 3)+"px"); //

            tooltip.style("visibility","visible");
        };

        TileOverlay.prototype.hideTooltip = function(){
            tooltip.style("visibility","hidden");
        };

        TileOverlay.prototype.project = function(latLng){
            return overlayProjection.fromLatLngToContainerPixel(latLng);
        }
    };

    return {
        restrict: 'E',
        require: '^map',

        link: function(scope, element, attrs, mapController) {
            var orgAttrs = parser.orgAttributes(element);
            var filtered = parser.filter(attrs);
            var options = parser.getOptions(filtered);
            var controlOptions = parser.getControlOptions(filtered);
            var events = parser.getEvents(scope, filtered);

            console.log("filtered", filtered, "options", options, 'controlOptions', controlOptions, 'events', events);
            /**
             * set options
             */

            var overlay = new TileOverlay(mapController,options,scope);
            /**
             * set events
             */


            mapController.addObject('d3TilesLayers', overlay);
        }
    }; // return
}]);